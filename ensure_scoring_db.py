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

Writes a full diagnostic log (scoring_db_debug.log) regardless of outcome -
the assistant operating this system has no direct access to GitHub Actions
run logs, so this is the real, working substitute: committed back to the
repo every run so the real cause of any failure can be read directly.
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
    _debug_lines.append(str(line))


def flush_debug():
    DEBUG_LOG.write_text("\n".join(_debug_lines) + "\n", encoding="utf-8")


def fail(msg):
    dbg(f"FAIL: {msg}")
    flush_debug()
    sys.exit(1)


def main():
    data = json.loads(BINDINGS_FILE.read_text(encoding="utf-8"))
    existing = data.get("d1_databases", [])

    if any(b.get("binding") == NEW_BINDING_NAME for b in existing):
        dbg(f"{NEW_BINDING_NAME} already present in {BINDINGS_FILE} - nothing to do.")
        flush_debug()
        return

    dbg(f"{NEW_BINDING_NAME} not found - creating real D1 database '{NEW_DATABASE_NAME}' via Wrangler...")
    result = subprocess.run(
        ["npx", "wrangler", "d1", "create", NEW_DATABASE_NAME, "--json"],
        capture_output=True, text=True, check=False
    )
    dbg("---- wrangler d1 create: raw stdout ----")
    dbg(result.stdout)
    dbg("---- wrangler d1 create: raw stderr ----")
    dbg(result.stderr)
    dbg(f"---- wrangler d1 create: exit code {result.returncode} ----")

    if result.returncode != 0:
        if "already exists" in (result.stdout + result.stderr).lower():
            dbg(f"'{NEW_DATABASE_NAME}' already exists on Cloudflare - looking up its real id instead of creating a duplicate.")
            list_result = subprocess.run(
                ["npx", "wrangler", "d1", "list", "--json"],
                capture_output=True, text=True, check=False
            )
            dbg("---- wrangler d1 list: raw stdout ----")
            dbg(list_result.stdout)
            dbg("---- wrangler d1 list: raw stderr ----")
            dbg(list_result.stderr)
            if list_result.returncode != 0:
                fail("wrangler d1 list also failed")
            list_start = list_result.stdout.find("[")
            if list_start == -1:
                fail("No JSON array found in wrangler d1 list output")
            all_dbs = json.loads(list_result.stdout[list_start:])
            found = next((d for d in all_dbs if d.get("name") == NEW_DATABASE_NAME), None)
            if not found:
                fail(f"'{NEW_DATABASE_NAME}' reported as already existing, but not found in d1 list output: {all_dbs}")
            database_id = found.get("uuid") or found.get("id")
            if not database_id:
                fail(f"Found '{NEW_DATABASE_NAME}' in d1 list but no id field present: {found}")
            existing.append({"binding": NEW_BINDING_NAME, "database_name": NEW_DATABASE_NAME, "database_id": database_id})
            data["d1_databases"] = existing
            BINDINGS_FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            dbg(f"Registered existing {NEW_DATABASE_NAME} (id={database_id}) - no duplicate created.")
            Path("scoring_db_binding_changed.flag").write_text("1", encoding="utf-8")
            flush_debug()
            return
        fail("Wrangler d1 create failed (non-zero exit), and it is not an 'already exists' case")

    raw = result.stdout
    start = raw.find("{")
    if start == -1:
        fail("No JSON object found anywhere in wrangler's stdout")
    try:
        parsed = json.loads(raw[start:])
    except json.JSONDecodeError as e:
        fail(f"Could not parse JSON from wrangler's stdout starting at first '{{': {e}")

    database_id = None
    if isinstance(parsed, dict):
        database_id = parsed.get("uuid") or parsed.get("id")
        if not database_id and isinstance(parsed.get("database"), dict):
            database_id = parsed["database"].get("uuid") or parsed["database"].get("id")
    if not database_id:
        fail(f"Wrangler succeeded but no database id found in parsed output: {parsed}")

    existing.append({"binding": NEW_BINDING_NAME, "database_name": NEW_DATABASE_NAME, "database_id": database_id})
    data["d1_databases"] = existing
    BINDINGS_FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    dbg(f"Created {NEW_DATABASE_NAME} (id={database_id}) and added {NEW_BINDING_NAME} binding to {BINDINGS_FILE}.")
    Path("scoring_db_binding_changed.flag").write_text("1", encoding="utf-8")
    flush_debug()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        dbg(f"UNHANDLED EXCEPTION: {type(e).__name__}: {e}")
        flush_debug()
        sys.exit(1)
