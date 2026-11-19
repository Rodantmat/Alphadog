#!/usr/bin/env python3
"""
READ-ONLY compact dump of PrizePicks' multi-pick quotes (nba_market.pp_quote, NBA) with each alternate's own factor from the same run, one line per lineup,
for fitting the goblin / demon payout model offline (owner 2026-11-18: "a few rounds of multiplier prediction for demons and goblins tiers").
Line: PD|run|section|n|same-game 0/1|factor:kind+side,...|power all-hit|flex hits=pay;...   Env: DATABASE_URL, PR_SINCE (default 2026-10-18).
"""
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import research_payout_proof as PP  # noqa: E402


def main():
    since = os.environ.get("PR_SINCE") or "2026-10-18"
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    rows = conn.execute("""SELECT run_file, section, n, power, flex, legs, note FROM nba_market.pp_quote
                           WHERE league = 7 AND status = 200 AND quoted_at >= %s ORDER BY run_file, seq""", (since,)).fetchall()
    fac = {}
    for rf, sec, n, pw, fx, legs, note in rows:
        if sec in ("LEG", "DRIFT", "LESS", "LAD") and n == 2:
            alt = [l for l in legs if l.get("odds") in ("goblin", "demon")]
            p = ((pw or {}).get("2") or {}).get("2")
            if len(alt) == 1 and p:
                fac[(rf, str(alt[0]["id"]), alt[0].get("side", "over"))] = float(p)
    out = 0
    for rf, sec, n, pw, fx, legs, note in rows:
        if sec in ("LEG", "DRIFT", "LESS", "SLIPQ") or n < 2:
            continue
        parts, ok = [], True
        for l in legs:
            if l.get("odds") in ("goblin", "demon"):
                p = fac.get((rf, str(l["id"]), l.get("side", "over")))
                if p is None:
                    ok = False
                    break
                parts.append(f"{p:g}:{l['odds'][0]}{'u' if l.get('side') == 'under' else 'o'}:{l['id']}:{str(l.get('stat') or '').replace(' ', '_').replace(',', '')}:{l.get('line')}")
            else:
                parts.append("3:s" + ("u" if l.get("side") == "under" else "o") + f":{l['id']}:{str(l.get('stat') or '').replace(' ', '_').replace(',', '')}:{l.get('line')}")
        if not ok:
            continue
        sg = int(len({l["game"] for l in legs}) < n)
        t = PP.tiers({"power": pw, "flex": fx}, n)
        pall = t.get(("power", n), 0)
        fl = ";".join(f"{h}={v:g}" for (s, h), v in sorted(t.items()) if s == "flex")
        print(f"PD|{rf[-21:-5]}|{sec}|{n}|{sg}|{','.join(parts)}|{pall:g}|{fl}|{(note or '') if sec.startswith('LAD') else ''}")
        out += 1
    print(f"PDN|{out} lineups", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
