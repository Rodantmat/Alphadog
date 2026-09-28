#!/usr/bin/env python3
"""
Runs betr_harvest.py, then commits the fresh boards/betr_<league>_current.json (+ _meta) to the repo so
P3's archive_live_boards.py ingests it like any other board. Designed for Windows Task Scheduler on the
owner's residential machine (the only place that can clear Betr's Cloudflare + reuse the logged-in profile).

Needs a GitHub token with repo write. Set it once as a user env var (NOT in this file):
    setx BETR_GH_TOKEN "ghp_xxx"     (then open a NEW PowerShell)
Config (env, all optional except league default NBA):
    BETR_LEAGUE (NBA|WNBA), BETR_REPO (default Rodantmat/Alphadog), BETR_BRANCH (default main)
Run:
    python nba/betr_run_and_commit.py
"""
import base64
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

LEAGUE = os.environ.get("BETR_LEAGUE", "NBA").upper()
REPO = os.environ.get("BETR_REPO", "Rodantmat/Alphadog")
BRANCH = os.environ.get("BETR_BRANCH", "main")
TOKEN = os.environ.get("BETR_GH_TOKEN", "")
HERE = Path(__file__).resolve().parent           # nba/
ROOT = HERE.parent
BOARDS = ROOT / "boards"


def gh(method, path, body=None):
    req = urllib.request.Request(f"https://api.github.com{path}", method=method,
                                 data=json.dumps(body).encode() if body else None)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def commit_file(relpath, content_bytes, message):
    # get current sha if the file exists
    sha = None
    try:
        cur = gh("GET", f"/repos/{REPO}/contents/{relpath}?ref={BRANCH}")
        sha = cur.get("sha")
    except Exception:  # noqa: BLE001
        pass
    body = {"message": message, "branch": BRANCH,
            "content": base64.b64encode(content_bytes).decode()}
    if sha:
        body["sha"] = sha
    gh("PUT", f"/repos/{REPO}/contents/{relpath}", body)
    print(f"  committed {relpath}", flush=True)


def main():
    if not TOKEN:
        print("BETR_GH_TOKEN not set. Run: setx BETR_GH_TOKEN \"<token>\" then reopen PowerShell.", file=sys.stderr)
        sys.exit(1)
    # 1) harvest (inherits env; BETR_LEAGUE/BETR_LOGIN/BETR_PROFILE_DIR pass through)
    print(f"harvesting Betr {LEAGUE} ...", flush=True)
    r = subprocess.run([sys.executable, str(HERE / "betr_harvest.py")], cwd=str(ROOT))
    if r.returncode != 0:
        print("harvest failed; not committing.", file=sys.stderr)
        sys.exit(r.returncode)
    # 2) commit the board file(s)
    stem = LEAGUE.lower()
    targets = [f"boards/betr_{stem}_current.json", f"boards/betr_{stem}_current_meta.json"]
    if LEAGUE == "NBA":
        targets.append("boards/betr_nba_current.json")
    for rel in targets:
        f = ROOT / rel
        if f.exists():
            commit_file(rel, f.read_bytes(), f"Betr {LEAGUE} board auto-commit [skip ci]")
    print("done.", flush=True)


if __name__ == "__main__":
    main()
