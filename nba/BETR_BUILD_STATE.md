# BETR — build state (2026-09-28, after 12 probes)

## SOLVED, proven headless on a GitHub runner (no phone / no MFA prompt / no browser)
- **Token minting is automatable forever.** Keycloak `betr-rn`, refresh token is **offline, never expires**.
  `POST account.betr.app/realms/betr/protocol/openid-connect/token` grant_type=refresh_token
  (+scope "openid profile email offline_access") -> access_token (1513 chars, byte-identical in size to the
  browser's). `audience=fantasy` on the refresh also returns 200. Secrets: BETR_REFRESH_TOKEN, BETR_CLIENT_ID.
- **The slate:** `GET api.betr.app/api/v3/events?league_ids=1` -> NBA games (league "1"), teams, tip times,
  is_player_props_booked. WORKS from the runner with the refreshed Bearer.
- **The board = GraphQL on a SECOND host:** `POST api.fantasy.betr.app/graphql`, op
  **LeagueUpcomingEvents(league: NBA|WNBA)** -> getUpcomingEventsV2 -> players -> **projections**:
  value (LINE), currentValue, **nonRegularValue (ALT LINE)**, nonRegularPercentage, allowedOptions{outcome},
  marketStatus, type, label. Full self-contained query is in probe_betr.py git history. WNBA teaches NBA.

## THE WALL: api.fantasy.betr.app/graphql -> 401 for EVERY server request; 200 only in the real browser
Twelve probes; each eliminated a cause. The token is NOT the issue and neither is the network:
- ❌ ACR/MFA: DISPROVEN. Both the refreshed token AND the captured browser token are `acr:"0"`, `aud:"account"`.
- ❌ The captured browser token (the one that works in Chrome right now) -> **401 from the runner**, direct.
- ❌ Residential proxy (PROXY_URL): 401.
- ❌ Full browser header set (sec-fetch-*, sec-ch-ua, priority, accept-language): 401.
- ❌ TLS fingerprint: tried chrome124/120/116/110/131/133a, safari17/18, edge99/101, ±proxy — ALL 401.
- ❌ Scope, audience=fantasy token, header versions: 401.
- api.betr.app accepts the SAME token; only api.fantasy.betr.app rejects it. Same bytes, browser=200 / server=401.
=> 🎯 REMAINING HYPOTHESIS: the fantasy SPA establishes a **session binding on first load** that a cold POST
   never creates — e.g. an initial handshake/mutation (a `login`/`createSession`/`viewer` GraphQL op), or a
   short-lived signed header the JS computes, or an httpOnly cookie set by a page GET that our request lacks.
   The bearer alone is necessary but NOT sufficient; the browser did something first that we haven't captured.

## THE ONE CAPTURE THAT ENDS IT (browser, 2 min — no phone)
On picks.betr.app logged in, DevTools Network, filter `fantasy`, reload, then open a game so props load.
Look at the FIRST fantasy graphql calls in order. We need:
  1. the operationName of the FIRST 1-2 graphql POSTs after load (before GetLobbyContent) — likely a
     session/viewer/login op,
  2. whether any fantasy response SETS a cookie (Response Headers -> set-cookie), and
  3. whether requests carry a header we haven't mirrored (x-*, a signature, a device/session id).
Right-click the FIRST graphql row -> Copy -> Copy as cURL (bash); save via Notepad "Save As UTF-8" -> upload.
That shows the handshake the cold request is missing. Then the harvester replays: handshake -> LeagueUpcomingEvents.

## Harvester (once unblocked; design approved = scheduled snapshot)
refresh -> [handshake] -> events?league_ids=1 -> LeagueUpcomingEvents(NBA) -> parse projections
(main + nonRegular alt lines + allowedOptions) -> boards/betr_nba_current.json. archive_live_boards routes
`betr` via rows_generic; add a rows_betr for the projection/alt shape (like rows_sleeper). Cron 2x daily.
Renews itself forever from the offline token.

## tooling
nba/probe_betr.py + nba-probe.yml (installs curl_cffi+ably; passes BETR_REFRESH_TOKEN, BETR_CLIENT_ID,
BETR_ACCESS_TOKEN, PROXY_URL). Trigger via nba/TRIGGER_NBA_PROBE.txt -> `script: probe_betr.py`.
