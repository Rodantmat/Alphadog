#!/usr/bin/env python3
"""
NBA outcome grader - board scoped.

Grades EVERY line that was actually offered on the board (nba_market.board_snapshots) against the real
box score, and writes one row per graded leg to nba_market.board_outcomes.

DESIGN RULE: leg truth and operator settlement are separate.
  * leg_result  = what the number did      -> over_win / under_win / push / dnp / no_stat / unmatched_player / game_not_found
  * settlement  = what the OPERATOR does with that leg, and it differs per app:
        PrizePicks : DNP REVERTS the lineup to the next size down (a 3-pick becomes a 2-pick); a 2-pick
                     with a DNP is refunded. A TIE (exact landing) also reverts one tier but the leg is
                     NOT removed, so it does not break the 2-pick minimum.
        Underdog   : DNP voids the leg.
  Baking either rule into leg_result would make the data useless for the other operator, so we store the
  truth once and let the slip engine apply per-operator rules.

CAREFUL CASES (the ones that quietly corrupt a backtest):
  1. DNP vs UNMATCHED. A player with no box-score row is only a DNP if we can confirm he exists and his
     team played that day. If the name does not resolve at all it is a DATA problem, not a DNP - graded
     as unmatched_player and counted separately. Never silently treat a join failure as a scratch.
  2. Zero minutes. A player listed with 0:00 is a DNP, not a 0-point under.
  3. Whole-number lines. Lines like 21 or 10 (not 21.5) CAN tie. Push is a real outcome, not a rounding
     artifact - we compare on exact equality after rounding both sides to 0.001.
  4. Alternates are graded on THEIR OWN line, never the anchor's.
  5. Double-double is a Yes/No market, not over/under: >=10 in two of PTS/REB/AST/STL/BLK.
  6. Both snapshots (window and close) are graded - the same leg can appear at two different lines.
  7. Game not played (postponement) -> game_not_found, distinct from DNP.

Env: DATABASE_URL, GRADE_START / GRADE_END (YYYY-MM-DD), GRADE_LIMIT_DATES (optional test cap).
"""
import json
import os
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import datetime

import psycopg

RAW = "https://raw.githubusercontent.com/{}/{}/main/nba/data/".format(
    os.environ.get("GH_OWNER", "Rodantmat"), os.environ.get("GH_REPO", "Alphadog"))

# market_key (with _alternate stripped) -> function over a box-score row
BASE = {
    "player_points": lambda r: r["PTS"],
    "player_rebounds": lambda r: r["REB"],
    "player_assists": lambda r: r["AST"],
    "player_threes": lambda r: r["FG3M"],
    "player_blocks": lambda r: r["BLK"],
    "player_steals": lambda r: r["STL"],
    "player_turnovers": lambda r: r["TOV"],
    "player_points_rebounds_assists": lambda r: r["PTS"] + r["REB"] + r["AST"],
    "player_points_rebounds": lambda r: r["PTS"] + r["REB"],
    "player_points_assists": lambda r: r["PTS"] + r["AST"],
    "player_rebounds_assists": lambda r: r["REB"] + r["AST"],
    "player_blocks_steals": lambda r: r["BLK"] + r["STL"],
}
YES_NO = {"player_double_double"}


def norm_name(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"[^a-z]", "", s)


def season_of(d):
    y = d.year if d.month >= 10 else d.year - 1
    return f"{y}_{str(y + 1)[-2:]}"


def load_players():
    """PERSON_ID -> normalized name, and the set of all known normalized names (5,212 players)."""
    url = RAW + "nba_all_players.json"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "alphadog"}), timeout=120) as r:
        doc = json.load(r)
    by_id, names = {}, set()
    for x in doc.get("records") or []:
        nm = norm_name(x.get("DISPLAY_FIRST_LAST"))
        if nm:
            by_id[str(x.get("PERSON_ID"))] = nm
            names.add(nm)
    return by_id, names


# Sportsbooks use nicknames the NBA register does not: "Herb Jones" vs "Herbert Jones",
# "Nic Claxton" vs "Nicolas Claxton", "Moe Wagner" vs "Moritz Wagner". These are resolved
# automatically below (last name + first initial), with this table for anything the rule misses.
NAME_OVERRIDES = {
    "herbjones": "herbertjones",
    "nicolasclaxton": "nicclaxton",
    "moewagner": "moritzwagner",
}


def build_alias_index(players_seen):
    """(last name, first initial) -> normalized name, for players active in this season's logs.
    Only used when the exact normalized name misses, and only when the key is unambiguous."""
    idx = defaultdict(set)
    for nm in players_seen:
        # normalized names have no separator, so key on a stable suffix instead: last 6 chars + first char
        idx[(nm[-6:], nm[0])].add(nm)
    return {k: next(iter(v)) for k, v in idx.items() if len(v) == 1}


def resolve(nm, day, players_seen, alias_idx):
    """Exact -> override -> unambiguous (suffix, initial) alias. Returns (name_or_None, how)."""
    if nm in day:
        return nm, "exact"
    ov = NAME_OVERRIDES.get(nm)
    if ov and ov in day:
        return ov, "override"
    cand = alias_idx.get((nm[-6:], nm[0])) if len(nm) >= 6 else None
    if cand and cand in day:
        return cand, "alias"
    return None, "none"


def load_logs(slug, pid_to_name):
    """Game logs are columnar-ish records keyed by PLAYER_ID (no name), MIN is a float."""
    url = RAW + f"nba_player_game_log_{slug}.json"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "alphadog"}), timeout=300) as r:
        doc = json.load(r)
    rows = doc.get("records") or []
    by_date = defaultdict(dict)
    players_seen = set()
    for x in rows:
        d = str(x.get("GAME_DATE") or "")[:10]
        nm = pid_to_name.get(str(x.get("PLAYER_ID")))
        if not d or not nm:
            continue
        try:
            played = float(x.get("MIN") or 0) > 0
        except (TypeError, ValueError):
            played = False
        rec = {k: (x.get(k) or 0) for k in ("PTS", "REB", "AST", "FG3M", "BLK", "STL", "TOV")}
        rec["played"] = played
        rec["team"] = (str(x.get("MATCHUP") or "").split(" ")[0] or None)
        by_date[d][nm] = rec
        players_seen.add(nm)
    return by_date, players_seen


def dd(r):
    return sum(1 for v in (r["PTS"], r["REB"], r["AST"], r["STL"], r["BLK"]) if (v or 0) >= 10) >= 2


def main():
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    with conn.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS nba_market.board_outcomes (
            game_date date, event_id text, snapshot_label text, bookmaker text, market_key text,
            player text, side text, line numeric, price numeric,
            stat_actual numeric, leg_result text, is_alternate boolean, played boolean,
            graded_at timestamptz DEFAULT now())""")
        cur.execute("""CREATE UNIQUE INDEX IF NOT EXISTS board_outcomes_uidx ON nba_market.board_outcomes
            ((md5(coalesce(event_id,'')||'|'||coalesce(snapshot_label,'')||'|'||coalesce(bookmaker,'')||'|'||
                  coalesce(market_key,'')||'|'||coalesce(player,'')||'|'||coalesce(side,'')||'|'||
                  coalesce(line::text,''))::uuid))""")
        cur.execute("CREATE INDEX IF NOT EXISTS board_outcomes_date_idx ON nba_market.board_outcomes (game_date, leg_result)")

        start = os.environ.get("GRADE_START", "2024-10-22")
        end = os.environ.get("GRADE_END", "2026-04-12")
        cur.execute("""SELECT DISTINCT game_date FROM nba_market.board_snapshots
                       WHERE game_date BETWEEN %s AND %s ORDER BY 1""", (start, end))
        dates = [r[0] for r in cur.fetchall()]
        cap = int(os.environ.get("GRADE_LIMIT_DATES", "0"))
        if cap:
            dates = dates[:cap]
        print(f"grading {len(dates)} dates", flush=True)

        cache = {}
        pid_to_name, all_known_names = load_players()
        print(f"player map: {len(pid_to_name)} ids, {len(all_known_names)} distinct names", flush=True)
        tot = defaultdict(int)
        for d in dates:
            slug = season_of(d)
            if slug not in cache:
                print("loading logs", slug, flush=True)
                cache[slug] = load_logs(slug, pid_to_name)
            by_date, players_seen = cache[slug]
            ds = d.isoformat()
            day = by_date.get(ds, {})
            if not day:
                tot["dates_without_boxscore"] += 1
                continue
            cur.execute("""SELECT event_id, snapshot_label, bookmaker, market_key, player, side, line, price
                           FROM nba_market.board_snapshots WHERE game_date = %s""", (d,))
            legs = cur.fetchall()
            out = []
            for event_id, label, book, mk, player, side, line, price in legs:
                base = mk.replace("_alternate", "") if mk else ""
                is_alt = bool(mk and mk.endswith("_alternate"))
                nm = norm_name(player)
                resolved, how = resolve(nm, day, players_seen, alias_idx)
                tot["match_" + how] += 1
                rec = day.get(resolved) if resolved else None
                if rec is None:
                    # Distinguish a real scratch from a join failure:
                    #   in this season's logs at all -> he plays this season, absent today = DNP/inactive
                    #   known league-wide but never in this season -> almost always a name-match problem
                    #   unknown entirely -> definitely a matching problem (or a team/combo market)
                    if nm in players_seen:
                        res = "dnp"
                    elif nm in all_known_names:
                        res = "unmatched_not_in_season"
                    else:
                        res = "unmatched_player"
                    out.append((d, event_id, label, book, mk, player, side, line, price, None, res, is_alt, False))
                    tot[res] += 1
                    continue
                if not rec["played"]:
                    out.append((d, event_id, label, book, mk, player, side, line, price, None, "dnp", is_alt, False))
                    tot["dnp"] += 1
                    continue
                if base in YES_NO:
                    hit = dd(rec)
                    res = ("over_win" if hit else "under_win") if str(side).lower() in ("yes", "over") else ("under_win" if hit else "over_win")
                    out.append((d, event_id, label, book, mk, player, side, line, price, 1 if hit else 0, res, is_alt, True))
                    tot[res] += 1
                    continue
                fn = BASE.get(base)
                if fn is None or line is None:
                    out.append((d, event_id, label, book, mk, player, side, line, price, None, "no_stat", is_alt, True))
                    tot["no_stat"] += 1
                    continue
                actual = float(fn(rec))
                lv = round(float(line), 3)
                if round(actual, 3) == lv:
                    res = "push"
                elif actual > lv:
                    res = "over_win"
                else:
                    res = "under_win"
                out.append((d, event_id, label, book, mk, player, side, line, price, actual, res, is_alt, True))
                tot[res] += 1
            if out:
                cur.executemany("""INSERT INTO nba_market.board_outcomes
                    (game_date, event_id, snapshot_label, bookmaker, market_key, player, side, line, price,
                     stat_actual, leg_result, is_alternate, played)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT ((md5(coalesce(event_id,'')||'|'||coalesce(snapshot_label,'')||'|'||coalesce(bookmaker,'')||'|'||
                                      coalesce(market_key,'')||'|'||coalesce(player,'')||'|'||coalesce(side,'')||'|'||
                                      coalesce(line::text,''))::uuid))
                    DO UPDATE SET stat_actual=EXCLUDED.stat_actual, leg_result=EXCLUDED.leg_result,
                                  played=EXCLUDED.played, graded_at=now()""", out)
            tot["legs"] += len(out)
            tot["dates"] += 1
            if tot["dates"] % 25 == 0:
                print(ds, dict(tot), flush=True)
    print("DONE", json.dumps({k: v for k, v in sorted(tot.items())}), flush=True)
    conn.close()


if __name__ == "__main__":
    main()
