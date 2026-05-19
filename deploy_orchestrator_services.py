#!/usr/bin/env python3
import shutil
import subprocess
from pathlib import Path

SECRETS_FILE = Path("secrets.production.json")
CONFIG = Path("wrangler.alphadog-v2-orchestrator.with-services.jsonc")

def find_npx():
    exe = shutil.which("npx") or shutil.which("npx.cmd") or shutil.which("npx.exe")
    if exe:
        return exe
    print("ERROR: npx was not found by Python.")
    print("Try: npx --version")
    raise SystemExit(1)

def main():
    if not SECRETS_FILE.exists():
        print("ERROR: secrets.production.json missing.")
        raise SystemExit(1)
    if not CONFIG.exists():
        print("ERROR: service-binding orchestrator config missing. Run generate_wrangler_configs.py.")
        raise SystemExit(1)

    npx = find_npx()
    cmd = [npx, "wrangler", "deploy", "--config", str(CONFIG), "--secrets-file", str(SECRETS_FILE)]
    print("$ " + " ".join(cmd))
    p = subprocess.run(cmd, shell=False)
    raise SystemExit(p.returncode)

if __name__ == "__main__":
    main()
