"""Read-only export of the history needed for Fliff strategy research.

Writes compact gzipped CSVs to fliff_probe/out/research/ (nothing else is touched; DB is only SELECTed):
  props.csv.gz   - ParlayAPI player-prop captures (sharp + Fliff books, full-game stat markets), one row per book/player/market/line/day
  box.csv.gz     - NBA player box scores since the season start, with display names
  pickem.csv.gz  - archived Fliff Pick'Em boards (nba_market.fliff_pickem_board)
  games.csv.gz   - Pinnacle game totals / team totals captured the same days (game-level context)
"""
import csv, gzip, os, sys, time
import psycopg

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "research")
SINCE = os.environ.get("EXPORT_SINCE", "2026-10-20")
BOOKS = ("pinnacle", "draftkings", "fanduel", "novig", "prophetx", "fliff", "bovada")
STAT_MARKETS = (
    "player_points", "player_rebounds", "player_assists", "player_pts_rebs_asts", "player_pts_rebs", "player_pts_asts",
    "player_rebs_asts", "player_threes", "player_threes_made", "player_points_milestones", "player_rebounds_milestones",
    "player_assists_milestones", "player_points_+_rebounds_+_assists_milestones", "player_points_+_rebounds_milestones",
    "player_points_+_assists_milestones", "player_rebounds_+_assists_milestones", "player_three_pointers_made_milestones",
    "player_steals", "player_blocks", "player_steals_milestones", "player_blocks_milestones",
    "player_points_alternate", "player_rebounds_alternate", "player_assists_alternate",
)
GAME_MARKETS = ("alternate_totals", "team_totals", "totals", "spreads", "h2h", "alternate_spreads")

QUERIES = {
    "props": (f"""
        select c.capture_date, c.captured_at, p->>'bookmaker', p->>'market_key', p->>'player', p->>'line',
               p->>'over_price', p->>'under_price', p->>'commence_time', p->>'home_team', p->>'away_team', p->>'last_update'
        from nba_market.parlay_props_captures c, jsonb_array_elements(c.payload) p
        where c.label='window' and c.capture_date >= %s and p->>'sport_key'='basketball_nba'
          and coalesce(p->>'period','FULL')='FULL' and p->>'bookmaker' = any(%s) and p->>'market_key' = any(%s)""",
        ["capture_date", "captured_at", "book", "market", "player", "line", "over", "under", "commence", "home", "away", "last_update"],
        lambda: (SINCE, list(BOOKS), list(STAT_MARKETS))),
    "games": (f"""
        select c.capture_date, p->>'bookmaker', p->>'market_key', p->>'player', p->>'line',
               p->>'over_price', p->>'under_price', p->>'commence_time', p->>'home_team', p->>'away_team'
        from nba_market.parlay_props_captures c, jsonb_array_elements(c.payload) p
        where c.label='window' and c.capture_date >= %s and p->>'sport_key'='basketball_nba'
          and coalesce(p->>'period','FULL')='FULL' and p->>'bookmaker'='pinnacle' and p->>'market_key' = any(%s)""",
        ["capture_date", "book", "market", "player", "line", "over", "under", "commence", "home", "away"],
        lambda: (SINCE, list(GAME_MARKETS))),
    "box": ("""
        select l.game_date, l.game_id, l.nba_player_id, coalesce(m.display_name, p.full_name), l.team_id, l.matchup, l.wl, l.min,
               l.pts, l.reb, l.ast, l.fg3m, l.stl, l.blk, l.tov, l.plus_minus
        from nba_stats.player_game_log l
        left join nba_ref.player_name_map m on m.player_id = l.nba_player_id::text
        left join nba_ref.players p on p.player_id::text = l.nba_player_id::text
        where l.game_date >= %s""",
        ["game_date", "game_id", "nba_player_id", "name", "team_id", "matchup", "wl", "min", "pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "plus_minus"],
        lambda: (SINCE,)),
    "pickem": ("""
        select game_date, snapshot_ts, player, team, prop, line, option_type, multiplier, fliff_game, matchup, tip_utc, proposal_fkey
        from nba_market.fliff_pickem_board""",
        ["game_date", "snapshot_ts", "player", "team", "prop", "line", "option_type", "multiplier", "fliff_game", "matchup", "tip_utc", "proposal_fkey"],
        lambda: ()),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    url = os.environ["DATABASE_URL"]
    for name, (sql, cols, args) in QUERIES.items():
        t = time.time()
        for attempt in range(3):
            try:
                with psycopg.connect(url, connect_timeout=30) as con:
                    con.execute("set statement_timeout = '900s'")
                    with con.cursor(name=f"x_{name}") as cur:
                        cur.itersize = 5000
                        cur.execute(sql, args())
                        n = 0
                        with gzip.open(os.path.join(OUT, f"{name}.csv.gz"), "wt", newline="") as fh:
                            w = csv.writer(fh)
                            w.writerow(cols)
                            for row in cur:
                                w.writerow(row)
                                n += 1
                print(f"EXPORT {name}: {n} rows in {time.time() - t:.0f}s", flush=True)
                break
            except Exception as e:  # transient pooler errors
                print(f"EXPORT {name} attempt {attempt + 1} failed: {type(e).__name__}: {e}", flush=True)
                time.sleep(10 * (attempt + 1))
        else:
            sys.exit(f"export {name} failed")


if __name__ == "__main__":
    main()
