# BETR — SOLVED (2026-09-28). Live board harvested end to end.

## HOW IT WORKS (path C, on a US-residential Windows machine)
Betr's board is anonymous GraphQL behind **Cloudflare Turnstile** (interactive checkbox) — that was the real
wall (not token, not IP; 17 raw-HTTP probes all 401'd because they weren't a real browser). Beaten with:
- **SeleniumBase UC Mode** (`pip install seleniumbase`) — undetected Chromium; `uc_gui_click_captcha()`
  clears Turnstile; auto-clicks the league tab (`//*[normalize-space(text())="WNBA"]`), no human tap.
- **Persistent Chrome profile** (`./betr_profile`) — log in BY HAND once (phone+password+SMS), session
  reused forever after; no re-login.
- **Passive CDP capture** — inject nothing (CSP blocks it; the lobby reloads and kills injected fetches).
  Enable `Network`, let the app fetch its own `getUpcomingEventsV2`, pull the body from the CDP
  performance log. That call returns 200 for the logged-in page.

Script: `nba/betr_harvest.py`. Run:
    python -m pip install --upgrade seleniumbase
    $env:BETR_LEAGUE="WNBA"; $env:BETR_LOGIN="1"; python nba/betr_harvest.py   # first time, log in
    $env:BETR_LEAGUE="WNBA"; python nba/betr_harvest.py                        # after: hands-off
NBA when it posts: BETR_LEAGUE="NBA" (writes betr_nba_current.json too).

## VERIFIED PARSE (WNBA, 2026-09-28)
~1,000 legs/run, ~600 main + ~400 alt, 32 players, 3 events. Correct field mapping (learned from the raw
shape, betr_debug_shape):
- stat = projection **key** (POINTS, REBOUNDS, ASSISTS, THREE_POINTERS_MADE, POINTS_REBOUNDS_ASSISTS,
  DOUBLE_DOUBLE, **1ST_QUARTER_POINTS** period props, ...). NOT `type`.
- **`type` is the payout TIER** (REGULAR/BOOSTED/SUPER_BOOSTED/MINI_BOOSTED/EDGE_1..4/BOOSTED_4) — Betr's
  goblin/demon axis. Kept as leg['tier'].
- sides are **MORE/LESS** -> over/under flags. 611/611 mains have a side; 136 both-sided.
- **nonRegularValue>0** is the alt ladder rung; 0.0 means no alt (earlier bug filed 553 junk 0.0 alts).

## PIPELINE
`archive_live_boards.py::rows_betr` maps Betr key -> scorer market key (period 1ST_QUARTER_/1ST_HALF_ ->
_q1/_h1), files non-REGULAR tiers and alt rungs as `_alternate`. Tuple width 14 = board_snapshots columns.
`betr` already in ARCHIVE_APPS and routed. So once the board file is committed, P3's archiver ingests it.

## OPEN (small)
- alt_percentage / boosted payout reads 0 in the capture — the multiplier likely lives on
  allowedOptions.marketOption, not nonRegularPercentage. Not needed for lines; capture when the multiplier
  work resumes.
- SCHEDULING (next): Windows Task Scheduler runs betr_harvest.py 2x/day on the owner's PC (or the mini-PC),
  then commits boards/betr_nba_current.json so P3 picks it up. Session persists via betr_profile; if it
  ever expires, one BETR_LOGIN=1 run re-establishes it.
