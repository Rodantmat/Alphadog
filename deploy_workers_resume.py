#!/usr/bin/env python3
import json
import shutil
import subprocess
import sys
from pathlib import Path

WORKERS = json.loads(Path("worker_manifest.json").read_text(encoding="utf-8"))["workers"]
SECRETS_FILE = Path("secrets.production.json")

def find_npx():
    exe = shutil.which("npx") or shutil.which("npx.cmd") or shutil.which("npx.exe")
    if exe:
        return exe
    print("ERROR: npx was not found by Python.")
    print("Try: npx --version")
    raise SystemExit(1)

def run(cmd):
    print("\n$ " + " ".join(cmd), flush=True)
    p = subprocess.run(cmd, shell=False)
    if p.returncode != 0:
        raise SystemExit(p.returncode)

def require_files():
    if not SECRETS_FILE.exists():
        print("ERROR: secrets.production.json is missing.")
        raise SystemExit(1)

    missing_configs = [w for w in WORKERS if not Path(f"wrangler.{w}.jsonc").exists()]
    if missing_configs:
        print("ERROR: wrangler configs missing. Run python generate_wrangler_configs.py")
        print("First missing:", missing_configs[:5])
        raise SystemExit(1)

    missing_worker_files = [w for w in WORKERS if not Path(f"{w}.js").exists()]
    if missing_worker_files:
        print("ERROR: worker JS files missing. Extract dummy worker ZIP into this flat folder.")
        print("First missing:", missing_worker_files[:5])
        raise SystemExit(1)

def main():
    require_files()
    npx = find_npx()

    start_after = None
    start_at = None

    args = sys.argv[1:]
    if "--start-after" in args:
        i = args.index("--start-after")
        start_after = args[i + 1]
    if "--start-at" in args:
        i = args.index("--start-at")
        start_at = args[i + 1]

    deploy_list = WORKERS[:]

    if start_after:
        if start_after not in WORKERS:
            print(f"ERROR: --start-after worker not found: {start_after}")
            raise SystemExit(1)
        deploy_list = WORKERS[WORKERS.index(start_after) + 1:]

    if start_at:
        if start_at not in WORKERS:
            print(f"ERROR: --start-at worker not found: {start_at}")
            raise SystemExit(1)
        deploy_list = WORKERS[WORKERS.index(start_at):]

    print("Deploying AlphaDog v2 workers.")
    print(f"Workers to deploy: {len(deploy_list)}")
    print(f"First worker: {deploy_list[0] if deploy_list else 'NONE'}")
    print(f"Last worker: {deploy_list[-1] if deploy_list else 'NONE'}")
    print("Windows-safe npx path:", npx)

    for worker in deploy_list:
        cfg = f"wrangler.{worker}.jsonc"
        run([npx, "wrangler", "deploy", "--config", cfg, "--secrets-file", str(SECRETS_FILE)])

    print("\nDONE: selected workers deployed.")
    print("After all 116 exist, run: python deploy_orchestrator_services.py")

if __name__ == "__main__":
    main()
