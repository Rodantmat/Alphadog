# BETR — build state (2026-09-28, live)

## SOLVED and proven headless (GitHub runner, no phone/MFA/browser)
- **Auth mints tokens headless.** Keycloak client `betr-rn`, refresh token is **offline / `refresh_expires_in: 0` (never expires)**.
  `POST account.betr.app/realms/betr/protocol/openid-connect/token` grant_type=refresh_token (+scope
  "openid profile email offline_access") -> access_token. Verified the refreshed token is **1513 chars,
  byte-for-byte the same length as the browser's working token**. Secrets: `BETR_REFRESH_TOKEN`, `BETR_CLIENT_ID`.
- **Events (the slate):** `GET api.betr.app/api/v3/events?league_ids=1` -> NBA games (league id "1"), teams,
  tip time, is_player_props_booked. WORKS with the refreshed Bearer.
- **THE BOARD IS GraphQL on a SECOND host:** `POST api.fantasy.betr.app/graphql`,
  operation **`LeagueUpcomingEvents(league: NBA|WNBA)`** -> getUpcomingEventsV2 -> events -> players ->
  **projections** (the props). The full self-contained query is captured (see git history of probe_betr.py):
  Projection fields = marketId, type, label, value (LINE), currentValue, **nonRegularValue (ALT LINE)**,
  nonRegularPercentage, allowedOptions{outcome} (over/under), marketStatus. Lobby op is `GetLobbyContent`;
  supporting op `GetEntryAndFeedConfigs`. Headers the app sends: channel: MOBILE_WEB, fantasy-api-version 16.0,
  fantasy-application-version 3.42.9, jurisdiction: CA, promotions-api-version 6.0, origin/referer picks.betr.app.
- WNBA is the teacher (NBA not posted till preseason); identical shape, just the league arg.

## THE WALL RIGHT NOW: fantasy GraphQL returns 401 to the refreshed token
- Same length token (1513b), full browser header set (sec-fetch-*, sec-ch-ua, priority), still
  `401 {"error":"Unauthorized","path":"/graphql"}` in ~40ms (rejected before the query runs).
- api.betr.app accepts this token (events work); **api.fantasy.betr.app rejects it.** The two hosts trust
  differently.
- 🎯 STRONGEST HYPOTHESIS: **ACR / MFA level.** The captured WORKING token has `"acr":"1"`, `"mfa":true`
  (minted through MFA at browser login). A silent refresh yields **`acr:"0"`** and the fantasy gateway
  likely requires acr:1. A refresh cannot elevate ACR -> if true, the fantasy API needs a token minted by
  an actual MFA login, which the offline token cannot reproduce. Softer wall than Chalkboard but real.
- ✅ THE DECISIVE TEST (do first next session): replay the **captured 1513-char browser token verbatim**
  (valid ~30 days from 2026-09-28) against api.fantasy.betr.app/graphql.
    - If it 200s and the refreshed one 401s -> ACR confirmed. Options: (a) accept manual monthly token
      refresh from the browser [low effort, 30-day cadence], or (b) find a client_id whose fantasy tokens
      don't require acr:1.
    - If the captured token ALSO 401s from the runner -> it's IP/edge, not ACR; try via PROXY_URL.
- Put the captured browser access token in secret `BETR_ACCESS_TOKEN` for that test (do NOT paste in chat).

## Then the harvester (design approved: scheduled snapshot)
[token] -> events?league_ids=1 -> LeagueUpcomingEvents(NBA) GraphQL -> parse projections (main + nonRegular
alt lines + allowedOptions) -> write boards/betr_nba_current.json. archive_live_boards routes `betr` via
rows_generic; will likely need a `rows_betr` for the projection/alt shape (like rows_sleeper). Cron 2x daily.

## probe tooling
`nba/probe_betr.py` (current = LeagueUpcomingEvents runner) + `nba-probe.yml` (installs curl_cffi+ably, passes
BETR_* secrets). Set `nba/TRIGGER_NBA_PROBE.txt` -> `script: probe_betr.py`, run the workflow.
