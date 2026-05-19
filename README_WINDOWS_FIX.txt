ALPHADOG V2 WINDOWS DEPLOY SCRIPT FIX v0.1

Replace these files in your C:\2\V2 folder:

deploy_all_workers.py
deploy_orchestrator_services.py

Reason:
Windows exposes npx as npx.cmd. Python subprocess on Windows may not find "npx" when shell=False.
These scripts locate npx, npx.cmd, or npx.exe safely.

After replacing files, run:

python deploy_all_workers.py

If it still fails, run:

npx --version

and paste the output.
