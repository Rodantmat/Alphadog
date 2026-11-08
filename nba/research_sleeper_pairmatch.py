import json, re, os, urllib.request, psycopg
def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"user-agent": "Mozilla/5.0", "accept": "application/json", "referer": "https://sleeper.com/"}), timeout=60).read())
nm = lambda s: re.sub(r"[^a-z]", "", (s or "").lower())
pl = get("https://api.sleeper.app/v1/players/nba"); by = {}
for pid, p in pl.items():
    n = nm((p.get("first_name") or "") + (p.get("last_name") or "")) or nm(p.get("full_name"))
    if n: by.setdefault(n, []).append(pid)
doc = get("https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true")
print("doc lines", len(doc)); ex = next(l for l in doc if l.get("sport") == "nba"); print(json.dumps(ex)[:900])
cur = {}; wagers = set()
for ln in doc:
    if ln.get("sport") != "nba": continue
    wagers.add(ln.get("wager_type"))
    for o in ln.get("options") or []:
        lv = o.get("outcome_value", o.get("line", ln.get("line")))
        try: lv = float(lv)
        except Exception: continue
        cur[(ln["subject_id"], ln["wager_type"], lv, str(o.get("outcome") or "").lower())] = o.get("line_id")
print("wagers", sorted(wagers))
c = psycopg.connect(os.environ["DATABASE_URL"])
rows = c.execute("select p, leg from nba_friend.pairs where game_date=(now() at time zone 'America/Los_Angeles')::date and app='sleeper' order by rank").fetchall()
for p, leg in rows:
    leg = leg if isinstance(leg, dict) else json.loads(leg)
    ids = by.get(nm(leg["player_name"])) or []
    side = "under" if leg["selected_side"] == "less" else "over"
    got = [(i, w) for i in ids for w in {leg["canonical_prop_key"]} | {"points_rebounds_assists", "points_rebounds", "points_assists", "rebounds_assists", "blocks_steals"} if (i, w, float(leg["line_value"]), side) in cur]
    near = sorted({k[2] for k in cur if k[0] in ids and k[1] == leg["canonical_prop_key"]})
    print(leg["player_name"], leg["canonical_prop_key"], leg["line_value"], side, "ids", ids, "MATCH", got, "board lines", near[:8])
