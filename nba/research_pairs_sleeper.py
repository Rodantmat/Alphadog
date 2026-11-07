import os, json, urllib.request, psycopg
req = urllib.request.Request("https://api.sleeper.app/lines/available?dynamic=true&include_preseason=true&enable_one_sided_lines=true",
    headers={"user-agent": "Mozilla/5.0", "accept": "application/json", "referer": "https://sleeper.com/"})
try:
    raw = urllib.request.urlopen(req, timeout=30).read()
    doc = json.loads(raw); print("sleeper board bytes", len(raw), "lines", len(doc))
    ids = set(str(o.get("line_id")) for ln in doc for o in ln.get("options", []) if o.get("line_id") is not None)
    print("line ids on board", len(ids))
except Exception as e:
    print("SLEEPER FETCH FAILED", e); ids = None
c = psycopg.connect(os.environ["DATABASE_URL"])
for sch in ("nba_friend", "nba_jessi"):
    rows = c.execute(f"select rank, leg from {sch}.pairs where game_date=(now() at time zone 'America/Los_Angeles')::date and app='sleeper' order by rank").fetchall()
    ok = 0; nolink = 0
    for r, leg in rows:
        leg = leg if isinstance(leg, dict) else json.loads(leg)
        lid = ((leg.get("link") or {}).get("ids") or {}).get("line_id")
        if not lid: nolink += 1
        elif ids is not None and str(lid) in ids: ok += 1
    print(sch, "sleeper pairs", len(rows), "on live board", ok, "no link", nolink)
