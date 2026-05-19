#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

WORKERS = json.loads(Path("worker_manifest.json").read_text(encoding="utf-8"))["workers"]
WORKERS_DEV_SUBDOMAIN = "rodolfoaamattos"

def fetch_with_curl(url):
    cmd = [
        "curl.exe",
        "-sS",
        "--max-time", "25",
        "-H", "User-Agent: AlphaDog-v2-verifier/1.0",
        url
    ]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, shell=False)
        if p.returncode != 0:
            return None, {"error": p.stderr.strip() or f"curl exit {p.returncode}"}
        try:
            return 200, json.loads(p.stdout)
        except Exception as e:
            return None, {"error": f"json_parse_failed: {e}", "raw": p.stdout[:1000]}
    except Exception as e:
        return None, {"error": str(e)}

results = []

for worker in WORKERS:
    url = f"https://{worker}.{WORKERS_DEV_SUBDOMAIN}.workers.dev/health"
    status, body = fetch_with_curl(url)
    ok = bool(
        status == 200
        and body.get("ok") is True
        and body.get("status") == "DUMMY_READY"
        and body.get("binding_summary", {}).get("required_db_bindings_present") is True
        and body.get("binding_summary", {}).get("expected_vars_present") is True
        and body.get("binding_summary", {}).get("required_secrets_present") is True
    )

    print(f"{'PASS' if ok else 'FAIL'} {worker} {status}")
    if not ok:
        print(json.dumps(body, indent=2)[:1200])

    results.append({
        "worker": worker,
        "url": url,
        "http_status": status,
        "ok": ok,
        "body": body
    })

Path("verify_results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")

failed = [r for r in results if not r["ok"]]
print(f"\nPassed: {len(results)-len(failed)} / {len(results)}")
print("Wrote verify_results.json")

if failed:
    print("\nFAILED WORKERS:")
    for r in failed[:20]:
        print("-", r["worker"], r["http_status"], r["body"].get("error"))
    raise SystemExit(1)

raise SystemExit(0)
