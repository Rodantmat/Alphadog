#!/usr/bin/env python3
import json
import shutil
import subprocess
from pathlib import Path

WORKERS = json.loads(Path("worker_manifest.json").read_text(encoding="utf-8"))["workers"]
SECRETS_FILE = Path("secrets.production.json")

def find_npx():
    exe = shutil.which("npx") or shutil.which("npx.cmd") or shutil.which("npx.exe")
    if exe:
        return exe
    print("ERROR: npx was not found by Python.")
    print("Try running this in the same terminal:")
    print("  npx --version")
    print("If that works, close/reopen the terminal and retry.")
    print("If not, install Node.js or fix your PATH.")
    raise SystemExit(1)

def run(cmd):
    print("\n$ " + " ".join(cmd))
    p = subprocess.run(cmd, shell=False)
    if p.returncode != 0:
        raise SystemExit(p.returncode)

def require_files():
    if not SECRETS_FILE.exists():
        print("ERROR: secrets.production.json is missing.")
        print("Copy secrets.template.json to secrets.production.json and fill values locally.")
        raise SystemExit(1)

    missing_configs = [w for w in WORKERS if not Path(f"wrangler.{w}.jsonc").exists()]
    if missing_configs:
        print("ERROR: wrangler configs missing. Run:")
        print("python generate_wrangler_configs.py")
        print("First missing:", missing_configs[:5])
        raise SystemExit(1)

    missing_worker_files = [w for w in WORKERS if not Path(f"{w}.js").exists()]
    if missing_worker_files:
        print("ERROR: worker JS files are missing. Extract alphadog_v2_dummy_workers_v0_1.zip into this same flat folder.")
        print("First missing:", missing_worker_files[:5])
        raise SystemExit(1)

def main():
    require_files()
    npx = find_npx()

    print("Deploying all workers with bindings/vars/secrets.")
    print("Windows-safe npx path:")
    print(npx)

    for worker in WORKERS:
        cfg = f"wrangler.{worker}.jsonc"
        run([npx, "wrangler", "deploy", "--config", cfg, "--secrets-file", str(SECRETS_FILE)])

    print("\nDONE: all phase-1 workers deployed.")
    print("Next: run python deploy_orchestrator_services.py after every worker exists.")

if __name__ == "__main__":
    main()
