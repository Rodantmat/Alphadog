#!/usr/bin/env python3
"""
Build derived market tables from nba_market.board_snapshots.

1) nba_market.market_consensus
   De-vigged sportsbook probability per (game_date, snapshot_label, player, market_key, line).
   The de-vig is done PER BOOK across the two sides of the SAME line: p = over/(over+under).
   Averaging raw implied probabilities across books without removing the vig first biases every
   number high by roughly half the hold - which would show up later as a fake edge.

   Flat DFS placeholder prices (-137 / +100) are excluded: they are PrizePicks' nominal pricing,
   not real odds, and would poison the consensus.

2) nba_market.event_game_map
   Bridges Odds API event_id -> NBA game_id, so board legs can join to enrichment (pace, rest,
   spread, travel, officials). Matched on game_date + both team names, normalized.

Env: DATABASE_URL. Safe to re-run: tables are rebuilt transactionally.
"""
import json
import os
import re
import unicodedata
import urllib.request

import psycopg

RAW = "https://raw.githubusercontent.com/Rodantmat/Alphadog/main/nba/data/"

CONSENSUS_SQL = """
DROP TABLE IF EXISTS nba_market.market_consensus_new;
CREATE TABLE nba_market.market_consensus_new AS
WITH bk AS (
  SELECT game_date, snapshot_label, player, market_key, line, bookmaker, side,
         CASE WHEN price>0 THEN 100.0/(price+100) ELSE (-price)/((-price)+100.0) END AS implied
  FROM nba_market.board_snapshots
  WHERE bookmaker IN ('draftkings','fanduel','betmgm','williamhill_us','betrivers','bovada','betonlineag','fanatics')
    AND price > -100000 AND price <> -137 AND price <> 100 AND line IS NOT NULL
), paired AS (
  SELECT o.game_date, o.snapshot_label, o.player, o.market_key, o.line, o.bookmaker,
         o.implied/(o.implied+u.implied) AS p_over
  FROM bk o JOIN bk u
    ON u.game_date=o.game_date AND u.snapshot_label=o.snapshot_label AND u.player=o.player
   AND u.market_key=o.market_key AND u.line=o.line AND u.bookmaker=o.bookmaker AND u.side='Under'
  WHERE o.side='Over'
)
SELECT game_date, snapshot_label, player, market_key, line,
       count(*)::int AS books,
       round(avg(p_over)::numeric,5) AS p_over_mean,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY p_over))::numeric,5) AS p_over_median,
       round(coalesce(stddev_samp(p_over),0)::numeric,5) AS p_over_sd
FROM paired GROUP BY 1,2,3,4,5;
"""


def norm_team(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", s)


def build_event_map(conn):
    """Odds API event_id -> NBA game_id.

    Source: the player game logs, which carry GAME_ID + GAME_DATE + MATCHUP ("LAC @ GSW") for all
    three seasons - better than nba_schedule_current.json, which only covers the current season.
    Team abbreviations are mapped to the board's full team names via nba_teams_current.json.
    """
    abbr_to_full = {}
    try:
        u = RAW + "nba_teams_current.json"
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "alphadog"}), timeout=60) as r:
            doc = json.load(r)
        for t in doc.get("records") or []:
            ab = t.get("abbreviation") or t.get("TEAM_ABBREVIATION") or t.get("ABBREVIATION")
            full = t.get("full_name") or t.get("TEAM_NAME") or t.get("nickname")
            if ab and full:
                abbr_to_full[ab.upper()] = norm_team(full)
    except Exception as exc:  # noqa: BLE001
        print("teams file:", exc)
    print("team map:", len(abbr_to_full))
    if len(abbr_to_full) < 30:
        # nba_teams_current.json was found EMPTY (0 records) - the 30 franchises are static, so a fixed map
        # is the correct fallback rather than another scrape. Full names normalized like the board's.
        _static = {
            "ATL": "Atlanta Hawks", "BOS": "Boston Celtics", "BKN": "Brooklyn Nets", "CHA": "Charlotte Hornets",
            "CHI": "Chicago Bulls", "CLE": "Cleveland Cavaliers", "DAL": "Dallas Mavericks", "DEN": "Denver Nuggets",
            "DET": "Detroit Pistons", "GSW": "Golden State Warriors", "HOU": "Houston Rockets", "IND": "Indiana Pacers",
            "LAC": "Los Angeles Clippers", "LAL": "Los Angeles Lakers", "MEM": "Memphis Grizzlies", "MIA": "Miami Heat",
            "MIL": "Milwaukee Bucks", "MIN": "Minnesota Timberwolves", "NOP": "New Orleans Pelicans", "NYK": "New York Knicks",
            "OKC": "Oklahoma City Thunder", "ORL": "Orlando Magic", "PHI": "Philadelphia 76ers", "PHX": "Phoenix Suns",
            "POR": "Portland Trail Blazers", "SAC": "Sacramento Kings", "SAS": "San Antonio Spurs", "TOR": "Toronto Raptors",
            "UTA": "Utah Jazz", "WAS": "Washington Wizards",
        }
        for ab, full in _static.items():
            abbr_to_full.setdefault(ab, norm_team(full))
        print("team map (with static fallback):", len(abbr_to_full))

    games = {}
    for slug in ("2024_25", "2025_26"):
        try:
            u = RAW + f"nba_player_game_log_{slug}.json"
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "alphadog"}), timeout=300) as r:
                doc = json.load(r)
            for x in doc.get("records") or []:
                gid = str(x.get("GAME_ID") or "")
                m = str(x.get("MATCHUP") or "")
                gd = str(x.get("GAME_DATE") or "")[:10]
                if not gid or not gd or gid in games:
                    continue
                # "LAC @ GSW" = away @ home ; "GSW vs. LAC" = home vs away
                if "@" in m:
                    away, home = [p.replace(".", "").strip() for p in m.split("@")[:2]]
                elif "vs" in m:
                    home, away = [p.replace(".", "").strip() for p in m.split("vs")[:2]]
                else:
                    continue
                h, a = abbr_to_full.get(home.upper(), ""), abbr_to_full.get(away.upper(), "")
                if h and a:
                    games[gid] = (gd, h, a)      # only lock in a fully resolved parse
        except Exception as exc:  # noqa: BLE001
            print(f"game log {slug}: {exc}")
    rows = [(gid, gd, h, a) for gid, (gd, h, a) in games.items() if h and a]
    print("games with both teams resolved:", len(rows), "of", len(games))
    if not rows:
        print("NO GAMES RESOLVED - event_game_map skipped")
        return 0
    with conn.cursor() as cur:
        cur.execute("""DROP TABLE IF EXISTS nba_market.schedule_norm;
                       CREATE TABLE nba_market.schedule_norm (game_id text, game_date date, home text, away text)""")
        cur.executemany("INSERT INTO nba_market.schedule_norm VALUES (%s,%s,%s,%s)", rows)
        cur.execute("CREATE INDEX schedule_norm_idx ON nba_market.schedule_norm (game_date, home, away)")
        cur.execute("""DROP TABLE IF EXISTS nba_market.event_game_map;
            CREATE TABLE nba_market.event_game_map AS
            SELECT DISTINCT b.event_id, s.game_id, b.game_date
            FROM (SELECT DISTINCT event_id, game_date,
                         regexp_replace(lower(home_team),'[^a-z]','','g') AS home,
                         regexp_replace(lower(away_team),'[^a-z]','','g') AS away
                  FROM nba_market.board_snapshots) b
            JOIN nba_market.schedule_norm s
              ON s.game_date = b.game_date AND s.home = b.home AND s.away = b.away""")
        cur.execute("SELECT count(*) FROM nba_market.event_game_map")
        n = cur.fetchone()[0]
    return n


def main():
    step = os.environ.get("DERIVED_STEP", "all")
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
    conn.execute("SET statement_timeout = 0")
    if step in ("consensus", "all"):
        with conn.cursor() as cur:
            print("building market_consensus ...", flush=True)
            cur.execute(CONSENSUS_SQL)
            cur.execute("SELECT count(*), round(avg(books),2) FROM nba_market.market_consensus_new")
            n, avg_books = cur.fetchone()
            print(f"market_consensus rows={n} avg_books={avg_books}", flush=True)
            if n == 0:
                raise SystemExit("ABORT: consensus is empty")
            cur.execute("""DROP TABLE IF EXISTS nba_market.market_consensus;
                           ALTER TABLE nba_market.market_consensus_new RENAME TO market_consensus;
                           CREATE INDEX market_consensus_idx ON nba_market.market_consensus
                             (game_date, player, market_key, line, snapshot_label)""")
            print("consensus done", flush=True)
    if step in ("map", "all"):
        print("building event_game_map ...", flush=True)
        mapped = build_event_map(conn)
        with conn.cursor() as cur:
            cur.execute("SELECT count(DISTINCT event_id) FROM nba_market.board_snapshots")
            total = cur.fetchone()[0]
        print(f"coverage: {mapped} of {total} events mapped", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
