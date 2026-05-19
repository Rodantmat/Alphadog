ALPHADOG V2 CLOUDFLARE AUTOMATION PACK
Version: alphadog-v2-cloudflare-automation-pack-v0.1

This pack automates Wrangler config generation and deployment for the 116 AlphaDog v2 Workers.

WHAT IT INCLUDES
- worker_manifest.json
- cloudflare_d1_bindings.json with your 11 D1 database IDs
- vars.production.json
- secrets.template.json
- generate_wrangler_configs.py
- deploy_all_workers.py
- deploy_orchestrator_services.py
- verify_all_workers.py
- github_actions_deploy_template.yml
- .gitignore

WHAT IT DOES
- Generates one wrangler.<worker>.jsonc file per Worker.
- Adds all 11 D1 bindings to every Worker config.
- Adds production vars to every Worker config.
- Uploads secrets to every Worker through Wrangler --secrets-file.
- Adds cron triggers only to alphadog-v2-orchestrator.
- Creates a second orchestrator config with service bindings after all Workers exist.

LOCAL STEPS
1. Put this pack in the same flat repo/folder as the 116 dummy Worker JS files.
2. Install Wrangler if needed: npm install -D wrangler
3. Run Wrangler login: npx wrangler login
4. Copy secrets.template.json to secrets.production.json.
5. Fill secrets.production.json locally. Do not upload it to GitHub or ChatGPT.
6. Run: python generate_wrangler_configs.py
7. Run: python deploy_all_workers.py
8. Run: python deploy_orchestrator_services.py
9. Edit verify_all_workers.py with your workers.dev subdomain.
10. Run: python verify_all_workers.py

NOTES
- Weather fields include OpenWeather variants because old docs confirm OpenWeather env variants were used.
- WEATHERAPI_KEY is included as optional because WeatherAPI was considered but not locked.
- Open-Meteo has no key because it is fallback/no-key.
