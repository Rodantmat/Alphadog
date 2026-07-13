#!/usr/bin/env python3
"""
Idempotent Scoring DB provisioner.

Checks cloudflare_d1_bindings.json for a "SCORING_DB" binding. If it already
exists, does nothing (safe to run on every deploy). If it doesn't exist,
creates a brand-new, dedicated Cloudflare D1 database via Wrangler CLI
(real network access available here in GitHub Actions, unlike the Claude
sandbox), captures its real database_id, and appends it to
cloudflare_d1_bindings.json so generate_wrangler_configs.py picks it up on
this same run.

Real, confirmed finding from a live failed run: this environment's Wrangler
version does not support `--json` on `d1 create` at all ("Unknown argument:
json") - it prints its normal human-readable output regardless. Real output
on success is a TOML-snippet block containing a line like:
    database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
This parses that directly with a regex instead of assuming JSON.

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
import re
import subprocess
import sys
from pathlib import Path

BINDINGS_FILE = Path("cloudflare_d1_bindings.json")
NEW_BINDING_NAME = "SCORING_DB"
NEW_DATABASE_NAME = "alphadog-v2-scoring-db"
DEBUG_LOG = Path("scoring_db_debug.log")
DATABASE_ID_RE = re.compile(r'database_id\s*=\s*"([0-9a-fA-F-]{36})"')
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


def register_binding(database_id, note):
    data = json.loads(BINDINGS_FILE.read_text(encoding="utf-8"))
    existing = data.get("d1_databases", [])
    existing.append({"binding": NEW_BINDING_NAME, "database_name": NEW_DATABASE_NAME, "database_id": database_id})
    data["d1_databases"] = existing
    BINDINGS_FILE.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    dbg(note)
    Path("scoring_db_binding_changed.flag").write_text("1", encoding="utf-8")


def main():
    data = json.loads(BINDINGS_FILE.read_text(encoding="utf-8"))
    existing = data.get("d1_databases", [])

    if any(b.get("binding") == NEW_BINDING_NAME for b in existing):
        dbg(f"{NEW_BINDING_NAME} already present in {BINDINGS_FILE} - nothing to do.")
        flush_debug()
        return

    dbg(f"{NEW_BINDING_NAME} not found - creating real D1 database '{NEW_DATABASE_NAME}' via Wrangler...")
    result = subprocess.run(
        ["npx", "wrangler", "d1", "create", NEW_DATABASE_NAME],
        capture_output=True, text=True, check=False
    )
    dbg("---- wrangler d1 create: raw stdout ----")
    dbg(result.stdout)
    dbg("---- wrangler d1 create: raw stderr ----")
    dbg(result.stderr)
    dbg(f"---- wrangler d1 create: exit code {result.returncode} ----")

    combined = result.stdout + result.stderr

    if result.returncode != 0:
        if "already exists" in combined.lower():
            dbg(f"'{NEW_DATABASE_NAME}' already exists on Cloudflare - looking up its real id instead of creating a duplicate.")
            list_result = subprocess.run(["npx", "wrangler", "d1", "list"], capture_output=True, text=True, check=False)
            dbg("---- wrangler d1 list: raw stdout ----")
            dbg(list_result.stdout)
            dbg("---- wrangler d1 list: raw stderr ----")
            dbg(list_result.stderr)
            info_result = subprocess.run(["npx", "wrangler", "d1", "info", NEW_DATABASE_NAME], capture_output=True, text=True, check=False)
            dbg("---- wrangler d1 info: raw stdout ----")
            dbg(info_result.stdout)
            m = DATABASE_ID_RE.search(info_result.stdout) or DATABASE_ID_RE.search(list_result.stdout)
            if not m:
                # d1 info's default table output may not match the create-command's TOML
                # snippet format - fall back to a bare-UUID search across both outputs.
                bare = re.search(r'\b([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b', info_result.stdout + list_result.stdout)
                if not bare:
                    fail(f"'{NEW_DATABASE_NAME}' already exists but could not find its real id in d1 info/list output")
                database_id = bare.group(1)
            else:
                database_id = m.group(1)
            register_binding(database_id, f"Registered existing {NEW_DATABASE_NAME} (id={database_id}) - no duplicate created.")
            flush_debug()
            return
        fail("Wrangler d1 create failed (non-zero exit), and it is not an 'already exists' case")

    m = DATABASE_ID_RE.search(combined)
    if not m:
        fail(f"Wrangler d1 create succeeded (exit 0) but no database_id line found in its output")
    database_id = m.group(1)
    register_binding(database_id, f"Created {NEW_DATABASE_NAME} (id={database_id}) and added {NEW_BINDING_NAME} binding to {BINDINGS_FILE}.")
    flush_debug()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        dbg(f"UNHANDLED EXCEPTION: {type(e).__name__}: {e}")
        flush_debug()
        sys.exit(1)
