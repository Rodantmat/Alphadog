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
DEBUG_LOG = Path("scoring_db_debug.log")
_debug_lines = []


def dbg(line):
    print(line)
    _debug_lines.append(line)


def flush_debug():
    # Real workaround for a real constraint: the assistant operating this system has
    # no direct access to GitHub Actions run logs. Writing full diagnostic output to a
    # committed file (regardless of success/failure) lets the real cause of any
    # failure here be read back directly afterward, the same way every other
    # diagnostic in this system is verified against real data rather than assumed.
    DEBUG_LOG.write_text("\n".join(_debug_lines) + "\n", encoding="utf-8")


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

    # Always print the real raw output first, regardless of outcome - this is the
    # single most useful thing for diagnosing a real failure from the workflow log,
    # and was missing last time, which is exactly why the first attempt's true cause
    # couldn't be confirmed from outside the CI run.
    print("---- wrangler d1 create: raw stdout ----")
    print(result.stdout)
    print("---- wrangler d1 create: raw stderr ----")
    print(result.stderr)
    print(f"---- wrangler d1 create: exit code {result.returncode} ----")

    if result.returncode != 0:
        # Real possibility given the first attempt's outcome is genuinely unknown from
        # outside the CI run: the database may have actually been created before an
        # earlier version of this script failed later (e.g. during the git commit-back
        # step), leaving a real, orphaned-but-live database that a blind retry would
        # either error on ("already exists") or, worse, duplicate. Check for that
        # specific real case before giving up.
        if "already exists" in (result.stdout + result.stderr).lower():
            print(f"'{NEW_DATABASE_NAME}' already exists on Cloudflare - looking up its real id instead of creating a duplicate.")
            list_result = subprocess.run(
                ["npx", "wrangler", "d1", "list", "--json"],
                capture_output=True, text=True, check=False
            )
            print("---- wrangler d1 list: raw stdout ----")
            print(list_result.stdout)
            if list_result.returncode != 0:
                print("wrangler d1 list also failed.", file=sys.stderr)
                print(list_result.stderr, file=sys.stderr)
                sys.exit(1)
            list_start = list_result.stdout.find("[")
            if list_start == -1:
                print("No JSON array found in wrangler d1 list output.", file=sys.stderr)
                sys.exit(1)
            all_dbs = json.loads(list_result.stdout[list_start:])
            found = next((d for d in all_dbs if d.get("name") == NEW_DATABASE_NAME), None)
            if not found:
                print(f"'{NEW_DATABASE_NAME}' reported as already existing, but not found in d1 list output: {all_dbs}", file=sys.stderr)
                sys.exit(1)
            database_id = found.get("uuid") or found.get("id")
            if not database_id:
                print(f"Found '{NEW_DATABASE_NAME}' in d1 list but no id field present: {found}", file=sys.stderr)
                sys.exit(1)
            existing.append({
                "binding": NEW_BINDING_NAME,
                "database_name": NEW_DATABASE_NAME,
                "database_id": database_id
            })
            data["d1_databases"] = existing
            BINDINGS_FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            print(f"Registered existing {NEW_DATABASE_NAME} (id={database_id}) - no duplicate created.")
            Path("scoring_db_binding_changed.flag").write_text("1", encoding="utf-8")
            return
        print("Wrangler d1 create failed (non-zero exit).", file=sys.stderr)
        sys.exit(1)

    # Real, known Wrangler quirk: --json output can still have a warning/notice line
    # (e.g. an update notification) printed to stdout before the actual JSON object.
    # Extract just the JSON object rather than assuming the whole stdout is clean JSON.
    raw = result.stdout
    start = raw.find("{")
    if start == -1:
        print("No JSON object found anywhere in wrangler's stdout.", file=sys.stderr)
        sys.exit(1)
    try:
        parsed = json.loads(raw[start:])
    except json.JSONDecodeError as e:
        print(f"Could not parse JSON from wrangler's stdout starting at first '{{': {e}", file=sys.stderr)
        sys.exit(1)

    database_id = None
    if isinstance(parsed, dict):
        database_id = parsed.get("uuid") or parsed.get("id")
        # Some Wrangler versions nest the real database object one level down.
        if not database_id and isinstance(parsed.get("database"), dict):
            database_id = parsed["database"].get("uuid") or parsed["database"].get("id")
    if not database_id:
        print(f"Wrangler succeeded but no database id found in parsed output: {parsed}", file=sys.stderr)
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
