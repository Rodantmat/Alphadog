#!/usr/bin/env python3
import json
import shutil
import subprocess
from pathlib import Path

MANIFEST = json.loads(Path("schema_manifest.json").read_text(encoding="utf-8"))

def find_npx():
    exe = shutil.which("npx") or shutil.which("npx.cmd") or shutil.which("npx.exe")
    if exe:
        return exe
    print("ERROR: npx not found. Run npm install -D wrangler first.")
    raise SystemExit(1)

def run(cmd):
    print("\n$ " + " ".join(cmd), flush=True)
    p = subprocess.run(cmd, shell=False)
    if p.returncode != 0:
        print("ERROR: command failed.")
        raise SystemExit(p.returncode)

def main():
    npx = find_npx()
    missing = []
    for db_name, files in MANIFEST["apply_order"]:
        for f in files:
            if not Path(f).exists():
                missing.append(f)
    if missing:
        print("Missing SQL files:", missing)
        raise SystemExit(1)

    print("Applying AlphaDog v2 schema pack.")
    print("Target: NEW v2 databases only.")
    print("Version:", MANIFEST["version"])

    for db_name, files in MANIFEST["apply_order"]:
        print(f"\n=== DATABASE: {db_name} ===")
        for f in files:
            run([npx, "wrangler", "d1", "execute", db_name, "--remote", "--file", f])

    print("\nSchema apply complete.")
    print("Next run: python verify_schema_all.py")

if __name__ == "__main__":
    main()
