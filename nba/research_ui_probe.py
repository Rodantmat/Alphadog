"""Time the main UI's endpoints from a GitHub runner (read-only GETs; the slips one is the same refresh the pipeline's warm step makes). Prefix UP|."""
import time, requests, json
B = "https://alphadog-v2-nba-main-ui.rodolfoaamattos.workers.dev"
for name, m, path in [("filters", "GET", "/api/main-board/filters"), ("board limit200", "GET", "/api/main-board/current?limit=200"), ("board limit200 again", "GET", "/api/main-board/current?limit=200"), ("slips", "POST", "/api/slips/high-hit")]:
    t = time.time()
    try:
        r = requests.request(m, B + path, json={} if m == "POST" else None, timeout=90)
        j = {}
        try: j = r.json()
        except Exception: pass
        print(f"UP|{name}: http {r.status_code} {time.time()-t:.1f}s ok={j.get('ok')} rows={len(j.get('rows') or j.get('generated_slips') or [])} err={str(j.get('error'))[:200]}", flush=True)
    except Exception as e:
        print(f"UP|{name}: EXC {time.time()-t:.1f}s {e}", flush=True)
