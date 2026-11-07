import os, json, urllib.request, psycopg
req = urllib.request.Request("https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true",
    headers={"user-agent": "Mozilla/5.0", "accept": "application/json", "referer": "https://sleeper.com/"})
doc = json.loads(urllib.request.urlopen(req, timeout=30).read())
ids = {}
for ln in doc:
    for o in ln.get("options", []):
        if o.get("line_id") is not None: ids[str(o["line_id"])] = (ln, o)
print("sample line keys", sorted(doc[0].keys())); print("sample option", json.dumps(doc[0]["options"][0])[:300])
c = psycopg.connect(os.environ["DATABASE_URL"])
rows = c.execute("select rank, leg from nba_jessi.pairs where game_date=(now() at time zone 'America/Los_Angeles')::date and app='sleeper' order by rank limit 3").fetchall()
for r, leg in rows:
    leg = leg if isinstance(leg, dict) else json.loads(leg)
    print("PAIR", r, leg["player_name"], leg["canonical_prop_key"], leg["line_value"], leg["selected_side"], leg["link"], leg["_g"].get("player"))
srows = c.execute("select slip_name, legs from nba_jessi.seen where game_date=(now() at time zone 'America/Los_Angeles')::date and app='sleeper'").fetchall()
for n, legs in srows:
    legs = json.loads(legs) if isinstance(legs, str) else legs
    if isinstance(legs, str): legs = json.loads(legs)
    for l in legs[:2]:
        lid = ((l.get("link") or {}).get("ids") or {}).get("line_id")
        print("SLIP", n, l["player_name"], lid, "on board" if str(lid) in ids else "NOT on board")
for r, leg in rows[:1]:
    leg = leg if isinstance(leg, dict) else json.loads(leg)
    gid = leg["event_id"].rsplit("-",1)[-1]; print("GAME", gid)
    for ln in doc:
        if ln.get("game_id") == gid and ln.get("wager_type") == "blocks":
            print("BOARD", ln.get("subject_id"), ln.get("status"), ln.get("updated_at"), [(o.get("outcome"), o.get("line_id"), o.get("outcome_value") or o.get("line") , o.get("payout_multiplier")) for o in ln["options"]])
