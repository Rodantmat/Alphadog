ALPHADOG V2 GITHUB MOBILE AUTO-DEPLOY PACK v0.1

PURPOSE
Let the user work mostly from phone:
- upload changed files to GitHub
- GitHub Actions deploys the changed Worker(s)
- manual workflow can deploy all 116 if needed
- no local PC required after setup

IMPORTANT
Do not use Cloudflare's basic Git connector for this 116-Worker setup.
Use GitHub Actions + Wrangler.

FILES IN THIS PACK

1. alphadog-v2-github-auto-deploy.yml
   Put this file in:
   .github/workflows/alphadog-v2-github-auto-deploy.yml

2. github_mobile_deploy_workers.py
   Put this file in repo root.

3. github_write_worker_secrets_file.py
   Put this file in repo root.

GITHUB REPO SECRETS NEEDED

Go to:
Rodantmat/Alphadog
→ Settings
→ Secrets and variables
→ Actions
→ New repository secret

Add these repository secrets:

REQUIRED:
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
ALPHADOG_ADMIN_TOKEN
ALPHADOG_INTERNAL_TOKEN

RECOMMENDED / USED BY WORKERS:
ODDS_API_KEY
PARLAY_API_KEY
GEMINI_API_KEY
ALPHADOG_WORKER_GITHUB_TOKEN
OPENWEATHER_API_KEY
OPEN_WEATHER_API_KEY
OPENWEATHERMAP_API_KEY
WEATHERAPI_KEY

IMPORTANT GITHUB TOKEN NAMING
Do NOT name the repo secret GITHUB_TOKEN.
GitHub already has a built-in token name.
Use:
ALPHADOG_WORKER_GITHUB_TOKEN

The workflow writes it into the Worker secret as:
GITHUB_TOKEN

GITHUB REPO VARIABLES OPTIONAL

Go to:
Settings
→ Secrets and variables
→ Actions
→ Variables

Optional variables:
GITHUB_OWNER_VALUE = Rodantmat
GITHUB_REPO_VALUE = Alphadog
GITHUB_BRANCH_VALUE = main
GITHUB_PRIZEPICKS_PATH_VALUE = prizepicks_mlb_current.json
MLB_API_USER_AGENT_VALUE = AlphaDog-v2/1.0 contact=Alphadog

If you skip these, the workflow defaults to those exact values.

PHONE WORKFLOW

For a normal worker update:
1. Upload/replace the changed file in GitHub.
   Example:
   alphadog-v2-control-room.js

2. Commit to main.

3. GitHub Actions runs automatically.

4. It deploys only the changed Worker.

CONTROL ROOM NOTE
If you upload/replace:
control_room.html

The workflow automatically deploys:
alphadog-v2-control-room

MANUAL DEPLOY ALL
In GitHub:
Actions
→ AlphaDog v2 Mobile Auto Deploy
→ Run workflow
→ deploy_scope = all

MANUAL DEPLOY CONTROL ROOM ONLY
Actions
→ AlphaDog v2 Mobile Auto Deploy
→ Run workflow
→ deploy_scope = control-room

MANUAL DEPLOY ORCHESTRATOR ONLY
Actions
→ AlphaDog v2 Mobile Auto Deploy
→ Run workflow
→ deploy_scope = orchestrator

WHAT GETS DEPLOYED
- Changed Worker JS file → that Worker only
- Changed wrangler.<worker>.jsonc → that Worker only
- Changed control_room.html → control-room
- Changed global config files → all Workers

GLOBAL FILES THAT DEPLOY ALL:
worker_manifest.json
vars.production.json
cloudflare_d1_bindings.json
generate_wrangler_configs.py
github_mobile_deploy_workers.py
github_write_worker_secrets_file.py

REQUIREMENT
The repo root must already contain:
worker_manifest.json
cloudflare_d1_bindings.json
vars.production.json
generate_wrangler_configs.py
wrangler.*.jsonc files or enough files to regenerate them
all worker .js files

SAFETY
The workflow generates a temporary secrets file inside GitHub Actions only:
.alphadog_worker_secrets.json

It deletes it at the end.
Do not commit this file.
Do not upload secrets.production.json to GitHub.
