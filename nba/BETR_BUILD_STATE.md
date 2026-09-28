# BETR — build state (2026-09-28, after 13 probes)

## SOLVED, proven headless on a GitHub runner
- Token minting automatable forever: Keycloak betr-rn, OFFLINE refresh token, grant_type=refresh_token ->
  valid access_token. audience=fantasy refresh also 200. userinfo with the token -> 200 (token IS valid).
- Slate: GET api.betr.app/api/v3/events?league_ids=1 -> 200 headless.
- Board = GraphQL POST api.fantasy.betr.app/graphql, op LeagueUpcomingEvents(league) -> players ->
  projections{ value(LINE), currentValue, nonRegularValue(ALT LINE), nonRegularPercentage,
  allowedOptions{outcome}, marketStatus }. Full query in probe_betr.py git history. WNBA teaches NBA.

## THE WALL: api.fantasy.betr.app/graphql -> 401 to EVERY server call, 200 only in the live browser
13 probes eliminated, in order: token identity, ACR, datacenter IP, residential proxy, request headers,
TLS/JA3 (10 impersonations), Set-Cookie/HttpOnly session cookie (NONE set anywhere; jar stays empty),
and — decisively — token CLAIMS: the captured browser token and the refreshed token are
CLAIM-FOR-CLAIM IDENTICAL (only-in-captured = {}, only-in-refreshed = {}, same sub, same sid
229b485b-697b-4030-94f0-d0dd793e0209). userinfo returns 200 for the token (signature valid).

=> CONCLUSION: the gateway is NOT checking the JWT alone. Same-bytes token = browser 200 / server 401.
   Remaining explanation consistent with ALL evidence: the fantasy gateway validates LIVE Keycloak
   SESSION state (sid), not just the JWT. Both tokens carry the SAME sid; the browser kept refreshing
   that session (owner grabbed tokens repeatedly), so the server's copy is a superseded token in a
   session whose current token lives in the browser -> rejected. i.e. one-live-token-per-session /
   session pinning, OR the fantasy edge requires a header/handshake the SPA computes that we still have
   not seen on the FIRST graphql calls.

## THE TWO TESTS THAT WOULD END IT (either, next session)
1. FRESH ISOLATED SESSION: log into Betr in a private/incognito window, and DO NOT touch that window
   again. Immediately grab that session's access token -> put in BETR_ACCESS_TOKEN -> run probe within
   a minute. If it 200s from the runner, session pinning is confirmed and the fix is: mint from a
   dedicated session the pipeline owns (never opened in a browser). The offline refresh token already
   gives us that if we stop logging in elsewhere with the same account.
2. FIRST-CALLS CAPTURE: on picks.betr.app reload with DevTools filter `fantasy`; capture the FIRST 1-2
   graphql POSTs BEFORE GetLobbyContent (a viewer/session/login op) and any request header we have not
   mirrored (x-*, a computed signature). Copy-as-cURL (save UTF-8) -> upload.

## Harvester (once unblocked; scheduled snapshot design approved)
refresh -> [handshake if any] -> events?league_ids=1 -> LeagueUpcomingEvents(NBA) -> parse projections
(main + nonRegular alt ladder + allowedOptions) -> boards/betr_nba_current.json. archive_live_boards
routes betr via rows_generic; add rows_betr for the projection/alt shape (like rows_sleeper). Cron 2x/day.

## tooling
nba/probe_betr.py + nba-probe.yml (installs curl_cffi+ably; passes BETR_REFRESH_TOKEN, BETR_CLIENT_ID,
BETR_ACCESS_TOKEN, PROXY_URL). Trigger: nba/TRIGGER_NBA_PROBE.txt -> `script: probe_betr.py`.

## RESEARCH (2026-09-28)
web sources (FraiseQL OIDC middleware, Clerk "works in browser, 401 on server") describe the
header-bearer-OR-HttpOnly-cookie fallback pattern; we tested and RULED OUT the cookie here. Gemini bridge
returned 404 (model name) — not consulted. Net: the cookie theory is eliminated; session-liveness is the
leading remaining cause, testable via the isolated-session test above.
