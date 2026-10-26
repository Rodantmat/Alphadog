#!/usr/bin/env python3
"""
PROBE - FLIFF PICK'EM QUOTE, THE APP'S OWN SHAPE, NO ACCOUNT (2026-10-26; owner 13:10 PT "get it done"). Runs
probe_fliff_pickem_quote.main with FLQ_EXACT=1: today's NBA Pick'Em cards from Fliff's public feed, then ONE quote request per size
(2 and 3 picks, different games) on the public Pick'Em host in exactly the shape Fliff's web app sends it (probe_fliff_quote_shape
run 40393564565): proposal_fkeys, proposal_fkey_to_conflict_fkey, mode 70002. No login, no token, nothing placed. If Fliff answers
only signed-in users, the answer says so and this stops there. Env: PROXY_URL.
"""
import os
import sys

os.environ["FLQ_EXACT"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_fliff_pickem_quote  # noqa: E402

if __name__ == "__main__":
    probe_fliff_pickem_quote.main()
