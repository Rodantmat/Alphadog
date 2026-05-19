ALPHADOG V2 CURL VERIFIER FIX v0.1

Replace only:

verify_all_workers.py

Reason:
The deployed Worker responds correctly with curl, but Python urllib reported 503 for all workers.
This verifier uses curl.exe directly and checks:

- ok=true
- status=DUMMY_READY
- required_db_bindings_present=true
- expected_vars_present=true
- required_secrets_present=true

Run:

python verify_all_workers.py

Expected:

Passed: 116 / 116
Wrote verify_results.json
