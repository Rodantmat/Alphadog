import os, json, urllib.request, psycopg
req = urllib.request.Request("https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true",
    headers={"user-agent": "Mozilla/5.0", "accept": "application/json", "referer": "https://sleeper.com/"})
doc = json.loads(urllib.request.urlopen(req, timeout=30).read())
ids = {}
for ln in doc:
    for o in ln.get("options", []):
        if o.get("line_id") is not None: ids[str(o["line_id"])] = (ln, o)
nba = [ln for ln in doc if ln.get("sport") == "nba"]
print("board lines", len(doc), "nba", len(nba), "ids", len(ids))
c = psycopg.connect(os.environ["DATABASE_URL"])
rows = c.execute("select app, rank, leg from nba_friend.pairs where game_date=(now() at time zone 'America/Los_Angeles')::date and app='sleeper' order by rank").fetchall()
on = 0
for a, r, leg in rows:
    leg = leg if isinstance(leg, dict) else json.loads(leg)
    lid = str(((leg.get("link") or {}).get("ids") or {}).get("line_id"))
    hit = ids.get(lid)
    on += 1 if hit else 0
    subj = None
    if hit: subj = hit[0].get("subject_id")
    print(r, leg["player_name"], leg["canonical_prop_key"], leg["line_value"], leg["selected_side"], "ON BOARD" if hit else "NOT on board", "tip", (leg.get("link") or {}).get("tip_utc"))
print("on board", on, "of", len(rows))
