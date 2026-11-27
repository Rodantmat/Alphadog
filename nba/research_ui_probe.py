"""Time the main UI's endpoints from a GitHub runner (read-only GETs; the slips one is the same refresh the pipeline's warm step makes). Prefix UP|."""
import time, json, urllib.request
B = "https://alphadog-v2-nba-main-ui.rodolfoaamattos.workers.dev"
for name, m, path in [("filters", "GET", "/api/main-board/filters"), ("board limit200", "GET", "/api/main-board/current?limit=200"), ("board limit200 again", "GET", "/api/main-board/current?limit=200"), ("slips", "POST", "/api/slips/high-hit")]:
    t = time.time()
    try:
        req = urllib.request.Request(B + path, data=(b"{}" if m == "POST" else None), method=m, headers={"content-type": "application/json", "user-agent": "alphadog-probe"})
        with urllib.request.urlopen(req, timeout=90) as r:
            body = r.read(); code = r.status
        j = {}
        try: j = json.loads(body)
        except Exception: pass
        print(f"UP|{name}: http {code} {time.time()-t:.1f}s ok={j.get('ok')} rows={len(j.get('rows') or j.get('generated_slips') or [])} err={str(j.get('error'))[:200]}", flush=True)
    except Exception as e:
        print(f"UP|{name}: EXC {time.time()-t:.1f}s {e}", flush=True)
