#!/usr/bin/env python3
"""
PROBE - THE SHAPE OF FLIFF'S PICK'EM QUOTE (2026-10-26; owner 13:10 PT: "research ... understand how the slip structure works,
multiplier works ... and get it done"). probe_fliff_pickem_quote run 40388441016: on the PUBLIC Pick'Em host (skipper_public_feed_endpoint,
no login) FCM__Skipper_Get_Parlay_Plus_Quote__Request is a KNOWN request - it answers 'class validation error' to our guessed fields.
This prints Fliff's own public web code around that request and its response (the fields it sends: selections / picks / mode /
entry type, and the Max / Flex multipliers it reads back), so the next run can ask the quote in exactly the app's shape.
Sends nothing to any account; reads public JavaScript only (probe_fliff_session.main with a narrower pattern). Env: PROXY_URL.
"""
import os
import sys

os.environ["FL_CTX"] = (r"(Skipper_Get_Parlay_Plus_Quote__Re(?:quest|sponse)|safe[A-Za-z]*SkipperParlayPlusQuote|getSkipperParlayPlusQuote|"
                        r"SkipperQuote|skipper_quote|flex_multiplier|max_multiplier|losing_selections|payout_type|entry_type|PayoutType\.|"
                        r"SkipperEntryType|SkipperPayoutType|CONST_[0-9]+_(?:MAX|FLEX|SUPER_FLEX|SUPERFLEX)[A-Z_]*)")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import probe_fliff_session  # noqa: E402

if __name__ == "__main__":
    probe_fliff_session.main()
