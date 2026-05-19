#!/usr/bin/env python3
import json
import os
from pathlib import Path

def env(name, default=""):
    value = os.environ.get(name, default)
    return value if value is not None else ""

secrets = {
    "ALPHADOG_ADMIN_TOKEN": env("ALPHADOG_ADMIN_TOKEN"),
    "ALPHADOG_INTERNAL_TOKEN": env("ALPHADOG_INTERNAL_TOKEN"),

    "ODDS_API_KEY": env("ODDS_API_KEY", "DISABLED"),
    "PARLAY_API_KEY": env("PARLAY_API_KEY", "DISABLED"),
    "GEMINI_API_KEY": env("GEMINI_API_KEY", "DISABLED"),

    "GITHUB_TOKEN": env("ALPHADOG_WORKER_GITHUB_TOKEN", "DISABLED"),
    "GITHUB_OWNER": env("GITHUB_OWNER_VALUE", "Rodantmat"),
    "GITHUB_REPO": env("GITHUB_REPO_VALUE", "Alphadog"),
    "GITHUB_BRANCH": env("GITHUB_BRANCH_VALUE", "main"),
    "GITHUB_PRIZEPICKS_PATH": env("GITHUB_PRIZEPICKS_PATH_VALUE", "prizepicks_mlb_current.json"),
    "MLB_API_USER_AGENT": env("MLB_API_USER_AGENT_VALUE", "AlphaDog-v2/1.0 contact=Alphadog"),

    "OPENWEATHER_API_KEY": env("OPENWEATHER_API_KEY", "DISABLED"),
    "OPEN_WEATHER_API_KEY": env("OPEN_WEATHER_API_KEY", env("OPENWEATHER_API_KEY", "DISABLED")),
    "OPENWEATHERMAP_API_KEY": env("OPENWEATHERMAP_API_KEY", env("OPENWEATHER_API_KEY", "DISABLED")),
    "WEATHERAPI_KEY": env("WEATHERAPI_KEY", "DISABLED"),

    "CLOUDFLARE_API_TOKEN": env("CLOUDFLARE_API_TOKEN"),
    "CLOUDFLARE_ACCOUNT_ID": env("CLOUDFLARE_ACCOUNT_ID"),
}

missing_required = [
    k for k in ["ALPHADOG_ADMIN_TOKEN", "ALPHADOG_INTERNAL_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]
    if not secrets.get(k)
]

if missing_required:
    print("Missing required secrets:", ", ".join(missing_required))
    raise SystemExit(1)

Path(".alphadog_worker_secrets.json").write_text(json.dumps(secrets, indent=2), encoding="utf-8")
print("Created .alphadog_worker_secrets.json for deploy. Secret values were not printed.")
