import json, re, urllib.request
def get(u):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"user-agent": "Mozilla/5.0", "accept": "application/json", "referer": "https://sleeper.com/"}), timeout=60).read())
pl = get("https://api.sleeper.app/v1/players/nba")
print("players/nba entries", len(pl))
nm = lambda s: re.sub(r"[^a-z]", "", (s or "").lower())
by = {}
for pid, p in pl.items():
    n = nm((p.get("first_name") or "") + (p.get("last_name") or "")) or nm(p.get("full_name"))
    if n: by.setdefault(n, []).append(pid)
doc = get("https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true")
nba = [ln for ln in doc if ln.get("sport") == "nba" and ln.get("subject_type") == "player"]
subs = sorted({ln["subject_id"] for ln in nba})
hit = [s for s in subs if s in pl]
print("nba player subjects on board", len(subs), "found in players/nba", len(hit))
for s in subs[:8]:
    p = pl.get(s) or {}
    print(s, p.get("full_name"), p.get("team"))
dup = sum(1 for n, v in by.items() if len(v) > 1)
print("names with >1 player id", dup, "of", len(by))
for n in ("cadecunningham", "jaylenbrown", "joelembiid", "zionwilliamson", "paulreed"):
    print(n, by.get(n))
import os, psycopg
c = psycopg.connect(os.environ["DATABASE_URL"])
rows = c.execute("select leg from nba_friend.pairs where game_date=(now() at time zone 'America/Los_Angeles')::date and app='sleeper'").fetchall()
ok = 0
for (leg,) in rows:
    leg = leg if isinstance(leg, dict) else json.loads(leg)
    n = nm(leg["player_name"]); ids = by.get(n) or []
    on = [i for i in ids if i in set(subs)]
    ok += 1 if on else 0
print("pair players resolvable by name to a subject with live NBA lines:", ok, "of", len(rows))
