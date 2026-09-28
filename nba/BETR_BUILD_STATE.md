# BETR — build state (2026-09-27, live)

## SOLVED and proven headless (GitHub runner, no phone/MFA/browser)
- **Auth is fully automatable.** Keycloak client `betr-rn`, refresh token is **offline / `refresh_expires_in: 0` (never expires)**.
  Flow: `POST account.betr.app/realms/betr/protocol/openid-connect/token` grant_type=refresh_token -> access_token (30-day).
  Secrets in repo: `BETR_REFRESH_TOKEN`, `BETR_CLIENT_ID`.
- **Events (the slate):** `GET api.betr.app/api/v3/events?league_ids=1` -> NBA games with teams, tip time (ms),
  `is_player_props_booked`, `is_sgp_enabled`, `event_details` (HUDDLE feed). NBA = league id "1".
- **Ably realtime:** `POST api.betr.app/api/v3/auth/user/ws-token-request` (Bearer) returns an Ably TokenRequest
  (keyName cANxcg.Zh90dA, capability market:* event:* fixture:* league:* public:* system:*). The Ably python
  SDK connects via auth_callback returning that dict. Verified: connects, subscribes clean.

## THE ONE OPEN PIECE: the player-prop board (with ALTERNATE lines)
- Idle Ably channels push nothing (subscribe AND rewind both empty on a game 10 days out) -> Ably carries
  live DELTAS, not the initial board.
- Every guessed REST markets path 500s `{"message":"There is currently no session available."}` — that is a
  MISSING HEADER the web app sends on market calls, not a real auth failure (events with the same Bearer work).
- NEXT: capture ONE request from the Betr WEB APP (picks.betr.app has a real web app — browser capture, no
  phone). Open an NBA game so props render; grab the call that returns them (markets/props/selections/sgp).
  That call's path + headers + params is all that's missing. Betr shows variations on the same line (alt
  ladder) — the harvester must capture every market variation per prop, like Sleeper's available_alt.

## Then the harvester (design approved: scheduled snapshot)
refresh -> access -> events?league_ids=1 -> [the props call per event] -> write boards/betr_nba_current.json
(archive_live_boards already routes `betr` via rows_generic; may need a rows_betr for the alt-line shape).
Cron twice daily. Renews itself forever from the offline token.

## probe tooling
`nba/probe_betr.py` (currently the live-Ably version) + `nba-probe.yml` (installs curl_cffi + ably, passes
BETR_* secrets). Set `nba/TRIGGER_NBA_PROBE.txt` to `script: probe_betr.py` and run the workflow.
