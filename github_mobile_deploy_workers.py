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
    "github_mobile_deploy_workers.py",
    "github_write_worker_secrets_file.py",
}

# generate_wrangler_configs.py is intentionally NOT in GLOBAL_REDEPLOY_FILES. It gets
# edited routinely just to register a single new worker (e.g. adding it to the
# Postgres/Hyperdrive special-case list below) and that should only redeploy the
# worker(s) actually affected - not force a full-fleet redeploy of 140+ workers every
# time. worker_manifest.json changes (which always accompany a new worker's own .js
# file in the same commit) already correctly trigger a targeted deploy of that new
# worker plus the orchestrator via TARGETED_EXTRA_FILES below.

# These change routinely (e.g. registering a single new worker) and must NOT force
# a full-fleet redeploy. A change here only pulls in a small, targeted set of extra
# deploy targets instead of the whole WORKERS list.
TARGETED_EXTRA_FILES = {
    "worker_manifest.json": ["alphadog-v2-orchestrator"],
    "vars.production.json": [],
    "cloudflare_d1_bindings.json": [],
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
        print("Global deploy tooling file changed. Deploying all workers.")
        return WORKERS[:]

    targets = []
    for f in changed:
        w = worker_from_file(f)
        if w and w not in targets:
            targets.append(w)
        extra = TARGETED_EXTRA_FILES.get(Path(f).name)
        if extra:
            for w2 in extra:
                if w2 not in targets:
                    targets.append(w2)
                    print(f"Targeted extra deploy: {Path(f).name} changed -> also deploying {w2}")

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
