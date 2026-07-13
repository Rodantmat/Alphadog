#!/usr/bin/env python3
"""
Idempotent Scoring DB provisioner.

Checks cloudflare_d1_bindings.json for a "SCORING_DB" binding. If it already
exists, does nothing (safe to run on every deploy). If it doesn't exist,
creates a brand-new, dedicated Cloudflare D1 database via Wrangler CLI
(real network access available here in GitHub Actions, unlike the Claude
sandbox), captures its real database_id from Wrangler's own JSON output, and
appends it to cloudflare_d1_bindings.json so generate_wrangler_configs.py
picks it up on this same run.

This is deliberately a separate, dedicated database (not a repurposed
existing one) per explicit instruction: the new Scoring system (Enrichment,
Final HP, Final Score, Final Board) needs its own isolated storage to plan
for real growth, distinct from every other phase's database.
"""
import json
import subprocess
import sys
from pathlib import Path

BINDINGS_FILE = Path("cloudflare_d1_bindings.json")
NEW_BINDING_NAME = "SCORING_DB"
NEW_DATABASE_NAME = "alphadog-v2-scoring-db"


def main():
    data = json.loads(BINDINGS_FILE.read_text(encoding="utf-8"))
    existing = data.get("d1_databases", [])

    if any(b.get("binding") == NEW_BINDING_NAME for b in existing):
        print(f"{NEW_BINDING_NAME} already present in {BINDINGS_FILE} - nothing to do.")
        return

    print(f"{NEW_BINDING_NAME} not found - creating real D1 database '{NEW_DATABASE_NAME}' via Wrangler...")
    result = subprocess.run(
        ["npx", "wrangler", "d1", "create", NEW_DATABASE_NAME, "--json"],
        capture_output=True, text=True, check=False
    )

    if result.returncode != 0:
        # Real, honest failure - do not fabricate an ID. Surface Wrangler's actual
        # stderr so a real cause (auth, name collision, quota) is visible in the
        # workflow log rather than silently continuing with a broken config.
        print("Wrangler d1 create failed.", file=sys.stderr)
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)

    # Wrangler's --json output on success is a JSON object with a real uuid field.
    parsed = json.loads(result.stdout)
    database_id = parsed.get("uuid") or parsed.get("id")
    if not database_id:
        print("Wrangler succeeded but no database id found in its output:", file=sys.stderr)
        print(result.stdout, file=sys.stderr)
        sys.exit(1)

    existing.append({
        "binding": NEW_BINDING_NAME,
        "database_name": NEW_DATABASE_NAME,
        "database_id": database_id
    })
    data["d1_databases"] = existing
    BINDINGS_FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Created {NEW_DATABASE_NAME} (id={database_id}) and added {NEW_BINDING_NAME} binding to {BINDINGS_FILE}.")

    # Signal to the workflow that a commit is needed for this file.
    Path("scoring_db_binding_changed.flag").write_text("1", encoding="utf-8")


if __name__ == "__main__":
    main()
