import os
os.environ["FR_APP"] = "BETR"; os.environ["FR_MODE"] = "pairs"
import datetime as dt, collections, psycopg
import friend_engine as F
conn = psycopg.connect(os.environ["DATABASE_URL"])
d = dt.datetime.now(F.PT).date()
legs = F.AA.live_legs(conn, d, {})
print("live_legs", len(legs))
ps = sorted([l.get("p") for l in legs if l.get("p") is not None], reverse=True)
print("with p", len(ps), "top", [round(x, 3) for x in ps[:10]])
print("with team", sum(1 for l in legs if l.get("team") is not None), "with event", sum(1 for l in legs if l.get("event_id") is not None))
print(collections.Counter((l.get("kind"), l.get("tier")) for l in legs).most_common(8))
print(legs[:2])
rows = conn.execute("select market_key, count(*), count(distinct player_name) from nba_market.board_snapshots where bookmaker='betr' and game_date=%s group by 1 order by 2 desc limit 15", (d,)).fetchall()
print(rows)
print(conn.execute("select * from nba_market.board_snapshots where bookmaker='betr' and game_date=%s limit 1", (d,)).fetchall())
print(conn.execute("select game_date, strategy, k, size, status, left(legs_json::text,300) from nba_score.betr_live_slips where game_date=%s", (d,)).fetchall())
