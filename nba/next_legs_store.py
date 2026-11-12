"""SUB THE NEXT RANKED CANDIDATE - storage (owner 2026-11-12 00:03 PT: "All strategies should work with sub the next ranked candidate").
Every live engine calls store() right after it builds a unit's slip: the unit's ranked candidate legs (best first, the slip's own legs and the unit's other slips' players left out)
go to nba_score.slip_next_legs (game_date, strategy, k, rank). The Slips screen (nba/main_ui/slips.js) turns them into slip.next_ranked and substitutes in that order; for PrizePicks
the quote step (pp_payout_map.py + slip_sub.py) uses the same table. Writing is inside a savepoint: a failure here never costs the engine its slips."""
import json

DDL = """CREATE TABLE IF NOT EXISTS nba_score.slip_next_legs (game_date date, strategy text, k int, rank int, leg jsonb, gc int,
         PRIMARY KEY (game_date, strategy, k, rank))"""
KEYS = ("player", "player_id", "prop", "side", "line", "tier", "kind", "factor", "m", "p", "pf", "event_id", "team", "team_id", "matchup", "unit", "roi", "score_roi")


def clean(l):
    o = {}
    for k in KEYS:
        v = l.get(k)
        if v is None:
            continue
        try:
            if hasattr(v, "item"):
                v = v.item()
        except Exception:
            pass
        if isinstance(v, float) and v != v:
            continue
        if not isinstance(v, (int, float, str, bool)):
            v = str(v)
        o[k] = v
    return o


def store(conn, day, strategy, k, cands, gc=1, n=25, exclude_players=()):
    """cands: ranked leg dicts (best first). One leg per player, never a player in exclude_players. Returns the rows written (0 on any failure)."""
    try:
        seen, out = set(str(p) for p in exclude_players), []
        for l in cands:
            key = str(l.get("player"))
            if key in seen:
                continue
            seen.add(key)
            out.append(clean(l))
            if len(out) >= n:
                break
        with conn.transaction():
            conn.execute(DDL)
            conn.execute("DELETE FROM nba_score.slip_next_legs WHERE game_date=%s AND strategy=%s AND k=%s", (day, strategy, k))
            for i, l in enumerate(out, start=1):
                conn.execute("INSERT INTO nba_score.slip_next_legs (game_date, strategy, k, rank, leg, gc) VALUES (%s,%s,%s,%s,%s::jsonb,%s)", (day, strategy, k, i, json.dumps(l), gc))
        return len(out)
    except Exception as e:  # noqa: BLE001 - never cost the engine its slips
        print(f"NEXT_LEGS|{strategy}:{k} not stored ({type(e).__name__}: {e})", flush=True)
        return 0
