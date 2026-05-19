#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path

WORKERS = json.loads(Path("worker_manifest.json").read_text(encoding="utf-8"))["workers"]
SECRETS_FILE = Path(".alphadog_worker_secrets.json")

GLOBAL_REDEPLOY_FILES = {
    "worker_manifest.json",
    "vars.production.json",
    "cloudflare_d1_bindings.json",
    "generate_wrangler_configs.py",
    "github_mobile_deploy_workers.py",
    "github_write_worker_secrets_file.py",
}

CONTROL_ROOM_EXTRA_FILES = {
    "control_room.html",
}

def find_npx():
    exe = shutil.which("npx") or shutil.which("npx.cmd") or shutil.which("npx.exe")
    if exe:
        return exe
    print("ERROR: npx was not found.")
    raise SystemExit(1)

def run(cmd):
    print("\n$ " + " ".join(cmd), flush=True)
    p = subprocess.run(cmd, shell=False)
    if p.returncode != 0:
        raise SystemExit(p.returncode)

def git_changed_files():
    # GitHub push usually has HEAD~1. For manual first run, fallback to all.
    commands = [
        ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
        ["git", "diff", "--name-only", "--cached"],
    ]
    for cmd in commands:
        p = subprocess.run(cmd, capture_output=True, text=True, shell=False)
        if p.returncode == 0:
            files = [x.strip() for x in p.stdout.splitlines() if x.strip()]
            if files:
                return files
    return []

def worker_from_file(path):
    name = Path(path).name

    if name in CONTROL_ROOM_EXTRA_FILES:
        return "alphadog-v2-control-room"

    if name.endswith(".js") and name[:-3] in WORKERS:
        return name[:-3]

    if name.startswith("wrangler.") and name.endswith(".jsonc"):
        inner = name[len("wrangler."):-len(".jsonc")]
        if inner.endswith(".with-services"):
            inner = inner[:-len(".with-services")]
        if inner in WORKERS:
            return inner

    return None

def targets_for_scope(scope):
    if scope == "all":
        return WORKERS[:]

    if scope == "control-room":
        return ["alphadog-v2-control-room"]

    if scope == "orchestrator":
        return ["alphadog-v2-orchestrator"]

    changed = git_changed_files()
    print("Changed files:")
    for f in changed:
        print(" -", f)

    if not changed:
        print("No changed files found. Deploying control room as safe default.")
        return ["alphadog-v2-control-room"]

    if any(Path(f).name in GLOBAL_REDEPLOY_FILES for f in changed):
        print("Global deploy file changed. Deploying all workers.")
        return WORKERS[:]

    targets = []
    for f in changed:
        w = worker_from_file(f)
        if w and w not in targets:
            targets.append(w)

    if not targets:
        print("No worker JS/config changed. Nothing to deploy.")
        return []

    return targets

def config_for_worker(worker):
    if worker == "alphadog-v2-orchestrator" and Path("wrangler.alphadog-v2-orchestrator.with-services.jsonc").exists():
        return "wrangler.alphadog-v2-orchestrator.with-services.jsonc"
    return f"wrangler.{worker}.jsonc"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", default="changed", choices=["changed", "all", "control-room", "orchestrator"])
    args = parser.parse_args()

    if not SECRETS_FILE.exists():
        print("ERROR: .alphadog_worker_secrets.json is missing.")
        raise SystemExit(1)

    npx = find_npx()
    targets = targets_for_scope(args.scope)

    print("\nDeploy scope:", args.scope)
    print("Workers selected:", len(targets))
    for t in targets:
        print(" -", t)

    for worker in targets:
        cfg = config_for_worker(worker)
        if not Path(cfg).exists():
            print(f"ERROR: missing config {cfg}")
            raise SystemExit(1)
        if not Path(f"{worker}.js").exists():
            print(f"ERROR: missing worker file {worker}.js")
            raise SystemExit(1)

        run([npx, "wrangler", "deploy", "--config", cfg, "--secrets-file", str(SECRETS_FILE)])

    print("\nDONE: GitHub mobile deploy completed.")

if __name__ == "__main__":
    main()
