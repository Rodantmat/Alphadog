"""
Real D1 REST API client used by the GBDT training pipeline.

Runs inside GitHub Actions (which has real network access, unlike Cloudflare Workers,
which cannot train models at all - confirmed from Cloudflare's own docs). Pulls real
historical data out of each D1 database via Cloudflare's HTTP API, one query at a time,
paginating with LIMIT/OFFSET since D1's REST API returns at most a few thousand rows
per call depending on row size.

Required environment variables (already present as GitHub Actions secrets, used for
wrangler auth elsewhere in this repo's deploy workflow):
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
"""
import os
import time
import requests

CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"

# Real, current database IDs - copied from cloudflare_d1_bindings.json (the committed
# single source of truth also used by generate_wrangler_configs.py). Kept as a literal
# dict here (not re-read from the JSON file at runtime) so this script has zero import
# dependency on the rest of the deploy tooling - deliberate isolation, same principle as
# the standalone historical-backfill worker.
DATABASE_IDS = {
    "CONTROL_DB": "13cd2d5d-6817-4d5c-88d6-2b7d0a52722a",
    "CONFIG_DB": "e55efd67-b2fb-41e2-8dfe-7e2a9ca78f00",
    "REF_DB": "c9c87590-f85e-4f19-bc1b-12d4a3e71f49",
    "STATS_HITTER_DB": "293b1eaf-ed73-4bfe-9a39-b5ec5d397100",
    "STATS_PITCHER_DB": "ef668380-3493-4445-9a50-08aef533d352",
    "TEAM_DB": "d5b68a35-005c-4e1a-8b3f-fca5515b0075",
    "DAILY_DB": "b08f5fde-2c26-4c73-848f-4db88ce6fe5e",
    "MARKET_DB": "9c8244c9-a15e-4d2a-a7e7-be1d1154cbdc",
    "CONTEXT_DB": "ca44e9a7-0624-4ac7-857e-5e2af70c6b8f",
    "SCORE_DB": "a078ae79-108f-4d4a-adee-443f83861de0",
    "ARCHIVE_DB": "71f03ce3-1178-43b6-8228-33cb9803b589",
    "SCORING_DB": "584fd46e-cbe0-4005-9c1f-20a912c77dc5",
}


class D1Client:
    def __init__(self):
        self.api_token = os.environ["CLOUDFLARE_API_TOKEN"]
        self.account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        })

    def query(self, db_binding, sql, params=None, max_retries=3):
        """Run a single SQL statement against a named database binding. Returns the
        real result rows as a list of dicts. Retries transient failures (matches the
        established pattern elsewhere in this system: a tool call occasionally errors
        out transiently even when the underlying request would have succeeded)."""
        database_id = DATABASE_IDS[db_binding]
        url = f"{CLOUDFLARE_API_BASE}/accounts/{self.account_id}/d1/database/{database_id}/query"
        body = {"sql": sql}
        if params:
            body["params"] = params
        last_error = None
        for attempt in range(max_retries):
            try:
                resp = self.session.post(url, json=body, timeout=30)
                data = resp.json()
                if not data.get("success"):
                    last_error = data.get("errors")
                    time.sleep(2 * (attempt + 1))
                    continue
                result = data["result"][0]
                return result.get("results", [])
            except Exception as err:  # noqa: BLE001 - real network calls, broad catch is intentional here
                last_error = str(err)
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"D1 query failed against {db_binding} after {max_retries} attempts: {last_error}\nSQL: {sql[:200]}")

    def query_paginated(self, db_binding, base_sql, order_by, page_size=5000):
        """Pull an entire real table/query result via LIMIT/OFFSET pagination, since D1's
        REST API caps rows per call. base_sql must NOT include its own LIMIT/OFFSET."""
        offset = 0
        all_rows = []
        while True:
            paged_sql = f"{base_sql} ORDER BY {order_by} LIMIT {page_size} OFFSET {offset}"
            rows = self.query(db_binding, paged_sql)
            if not rows:
                break
            all_rows.extend(rows)
            if len(rows) < page_size:
                break
            offset += page_size
        return all_rows
