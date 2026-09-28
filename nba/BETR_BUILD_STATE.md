# BETR — build state (2026-09-28, after 14 probes)

## SOLVED, proven headless
- Keycloak betr-rn OFFLINE refresh token -> valid access_token (userinfo 200). audience=fantasy refresh 200.
- Slate: GET api.betr.app/api/v3/events?league_ids=1 -> 200 headless.
- Board query known: GraphQL POST api.fantasy.betr.app/graphql, op LeagueUpcomingEvents(league) ->
  players -> projections{ value(LINE), currentValue, nonRegularValue(ALT LINE), nonRegularPercentage,
  allowedOptions{outcome}, marketStatus }. Full query in probe_betr.py git history. WNBA teaches NBA.

## THE WALL (14 probes) — the Keycloak bearer is NOT what the fantasy gateway accepts
api.fantasy.betr.app/graphql -> 401 to every server request; 200 only in the live browser. Ruled OUT with
controlled tests, each: token identity (captured browser token 401s from server), token CLAIMS (captured
vs refreshed are claim-for-claim IDENTICAL), ACR, datacenter IP, residential proxy, request headers,
TLS/JA3 (10 impersonations), HttpOnly/Set-Cookie (none set anywhere), and SESSION rotation (all chained
refreshes reuse the SAME sid 229b485b… — the offline token cannot spawn a new session; a freshly minted
token used within the same second still 401s). Alt hosts: api.betr.app/graphql 500 "no session",
picks.betr.app/graphql 405.

=> CONCLUSION: the browser performs an exchange we have NOT captured — almost certainly at app load, BEFORE
   the GetLobbyContent/LeagueUpcomingEvents calls: the SPA trades the Keycloak token for a FANTASY-NATIVE
   credential (a second token, or a signed header the JS bundle computes), and that is what /graphql wants.
   The Keycloak bearer alone is necessary-but-insufficient. This is the ONE thing left and it must be SEEN.

## THE CAPTURE THAT ENDS IT (browser, 2 min, no phone)
picks.betr.app logged in -> DevTools Network -> clear -> reload the page -> in the filter box type: betr.app
Capture, in ORDER, EVERY request to *.betr.app from the first second of load until the board renders,
especially:
  - the FIRST call(s) to api.fantasy.betr.app (before GetLobbyContent) — look for a login/session/exchange
    op, or a REST /auth call that RETURNS a token,
  - any response that returns a NEW token/JWT (Response tab), and
  - any request header on the graphql call we have not mirrored (x-*, a signature, a device id).
Right-click the api.fantasy.betr.app graphql row -> Copy -> Copy as cURL (bash); ALSO copy the response of
any auth/session/exchange call before it. Save as UTF-8 (.js) and upload. That reveals the fantasy
credential the cold request is missing.

## Harvester (once unblocked; scheduled snapshot design approved)
refresh -> [fantasy exchange] -> events?league_ids=1 -> LeagueUpcomingEvents(NBA) -> parse projections
(main + nonRegular alt ladder + allowedOptions) -> boards/betr_nba_current.json. archive_live_boards routes
betr via rows_generic; add rows_betr (like rows_sleeper). Cron 2x/day. Renews forever from the offline token.

## tooling
nba/probe_betr.py + nba-probe.yml (curl_cffi+ably; passes BETR_REFRESH_TOKEN, BETR_CLIENT_ID,
BETR_ACCESS_TOKEN, PROXY_URL). Trigger: nba/TRIGGER_NBA_PROBE.txt -> `script: probe_betr.py`.

## RESEARCH (2026-09-28)
Web sources described the bearer-OR-HttpOnly-cookie fallback; tested and RULED OUT (no cookie). Gemini
bridge 404 (model name), not consulted. Net after 14 probes: not token, not network, not TLS, not cookie,
not session — the missing piece is a fantasy-host credential exchange visible only in the app-load capture.
