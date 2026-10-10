# BETR PICKS — COMPLETE BUILD RECORD (2026-09-28)

## ★ FIVE-APP SCRAPER AUDIT (2026-09-28) — all cloud-independent, all wired to NBA
Requested check: are all five DFS scrapers mining, fully cloud-independent, and wired to NBA? Result:

| App | Cloud-independent? | Live now (open sport) | NBA wiring | Parser verified on live data |
|-----|--------------------|-----------------------|-----------|------------------------------|
| PrizePicks | ✅ P3 + `nba-pp-payout-map.yml` cron | ✅ NBA board already posted (2.2M rows, fetched today) | ✅ archiver `rows_prizepicks` | ✅ (live NBA board) |
| Underdog | ✅ `underdog-board.yml` cron */2h, curl_cffi+PROXY | ✅ MLB 20 legs; NBA 3 (barely open) | ✅ `rows_underdog` | ✅ MLB dry-run clean |
| Sleeper | ✅ `sleeper-board.yml` cron */2h | ✅ WNBA 740 legs / 596 alt | ✅ `rows_sleeper` | ✅ WNBA dry-run — FIXED combo keys (see below) |
| Fliff | ✅ `fliff-board.yml` cron */2h | ✅ MLB 4,738 legs | ✅ `rows_fliff` | ✅ MLB dry-run clean (see sport-filter note) |
| Betr | ✅ `betr-cloud-harvest.yml` cron 2x/day (browser) | ✅ WNBA 1,281 legs / 514 alt, committed by runner | ✅ `rows_betr` | ✅ WNBA dry-run — FIXED assists_rebounds |

Key facts:
- **All five run entirely in GitHub Actions** (no owner machine). Sleeper/Underdog/Fliff are plain HTTP
  scrapers (curl_cffi + residential PROXY_URL) — no browser/Cloudflare, the easy case. Betr needs the
  browser harvester (this doc). PrizePicks runs in P3 + its payout-map workflow.
- **Archiver wiring is complete:** `nba-p3-afternoon-light.yml` runs `archive_live_boards.py` with
  `ARCHIVE_APPS="prizepicks,underdog,sleeper,fliff,betr"`, `ARCHIVE_SPORT=nba`, `ARCHIVE_LABEL=window`,
  once daily. So all five land in `nba_market.board_snapshots` the moment their NBA boards populate.
- **Why DB rows look thin for four of five:** NBA hasn't opened (Oct 20). Their scrapers are fresh TODAY on
  their open sports (WNBA/MLB); the NBA files are near-empty by nature, so the archiver correctly stores
  little. PrizePicks is the exception (its NBA board posts weeks early). This is expected, not breakage.
- **Bugs caught by dry-running parsers on live boards (pre-NBA), now fixed in archive_live_boards.py:**
  - `rows_sleeper`: combo wager types were emitting `player_points_and_rebounds` etc.; the scorer keys are
    `player_points_rebounds` (no "and"). Added a normalizer (drops `_and_`/`+`, orders P>R>A). Now 0 unmapped.
  - `rows_betr`: `ASSISTS_REBOUNDS` fell through unmapped; added both orderings. Now 0 unmapped.
- **Fliff sport-filter caveat:** `fliff_mlb_current.json` contained mostly NFL props (anytime_touchdowns,
  receptions, tackles) — Fliff's scraper sport filter is loose. Harmless for NBA because the archiver's
  NOT-NBA guard (T26-7) rejects other-sport vocabulary before insert, but worth tightening the Fliff scraper
  when convenient so the NBA file isn't padded with other sports.
- **Betr auto-switches WNBA->NBA on 2026-10-20** (date-driven in the workflow); the others already request
  the `nba` board via their scrapers, so no per-app switch is needed for NBA opening.

──────────────────────────────────────────────────────────────────────────────


Status: ✅ **FULLY CLOUD, LIVE.** Betr's board is harvested and committed entirely by a GitHub Actions
runner — no owner machine. Verified 2026-09-28: `boards/betr_wnba_current_meta.json` written with
`source: "github-runner uc+proxy picks.betr.app"`, 1,281 legs / 514 alt / 46 players / 4 events.
Scheduled 2x/day. Path C (owner PC) remains as a proven fallback.

## THE FULLY-CLOUD PIPELINE (no owner hardware)
Workflow `.github/workflows/betr-cloud-harvest.yml` (cron 17:45 & 20:15 UTC = 10:45 & 13:15 PT), runs
`nba/betr_harvest_cloud.py` on ubuntu-latest and commits the board. Proven chain:
1. **Cloudflare Turnstile** — SeleniumBase UC Mode + **Xvfb** (fonts installed) clears it on the runner.
2. **Authenticated residential proxy** — UC Mode can't route inline-auth proxies for sub-resources, so a
   **local unauth forward-proxy** runs on the runner: `python -m proxy --plugins proxy.plugin.ProxyPoolPlugin
   --proxy-pool <user>-country-us-session-<id>-lifetime-10:<pass>@rp.scrapegw.com:6060`, Chrome -> 127.0.0.1.
   (ProxyScrape US-sticky username per their docs.)
3. **Login wall** — the board is login-only (all /lobby -> /auth without a session). Seeded from GH secret
   **`BETR_SESSION_STATE`** (cookies + auth localStorage, exported once by `nba/betr_export_session.py` slim
   output, ~10KB). Loaded into the runner's Chrome before nav.
4. **Geolocation gate** — `/AllowLocation?...onSelectUsState=`; auto-selects a US state (BETR_STATE, default
   California) in-page.
5. **Capture** — intercept the app's own `getUpcomingEventsV2` via CDP; parse projections (stat=key,
   tier=type, MORE/LESS sides, nonRegularValue>0 = alt ladder) -> boards/betr_<league>_current.json.
6. **Commit** — `permissions: contents: write` lets github-actions[bot] push the board (needs repo Settings
   -> Actions -> Workflow permissions = Read and write). P3's archiver then ingests it via rows_betr.

Secrets used: `PROXY_URL` (ProxyScrape residential), `BETR_SESSION_STATE` (seeded login).

## ★ 2026-10-09 — THE APP CHANGED; THE HARVESTER WAS RE-PROVEN (runs 38005105453 WNBA, 38006445274 EPL)
Betr shipped a new web app between 10-07 and 10-09: it lands on `/picks/home/lobby` (the old `/lobby/<league>`
redirects there), the league board is reached ONLY through a horizontal strip of league chips (`NFL | MLB | WNBA |
CFB | NHL | … | NBA | CBB | …`, React-Native-web Pressables, most off-screen), the lobby answers
`getUpcomingLobbyEventsV2` (+ `getTopTrendingPlayersData`, every sport mixed, featured players only) and the league
board is the request `LeagueUpcomingEvents {league}` → response `getUpcomingEventsV2` (the 2026-09-28 shape, unchanged).
What had to change in `nba/betr_harvest_cloud.py` (commits 98cbdc6 … 158cfe0), each step proven by a run:
1. **League navigation = a REAL mouse press on the chip.** A JS `.click()` on the leaf does nothing (run 38004204387);
   RNW's press responder needs pointer events. `click_league`: scroll the leaf into view (instant), let the strip settle
   1.2 s, re-read its rect, check `elementFromPoint` is the leaf, then CDP `Input.dispatchMouseEvent` moved / pressed /
   released; success = the route changes to `/picks/home/<LEAGUE>`. Fallbacks: dispatched pointer/mouse event sequence,
   then the old XPaths. Proven on an on-screen chip (WNBA → 728 legs, 2 events) and a scrolled one (EPL → 5,011 legs,
   10 events).
2. **Stay attached.** `uc_open_with_reconnect` detaches chromedriver for the navigation, and every graphql body that
   arrives while detached is unreadable afterwards (4 of 5 on 38004204387). Now ONE detached navigation to the root, then
   `enable_network` (200 MB body buffer) and everything in-page; unread bodies are retried 3 passes instead of dropped.
3. **League filter.** `flatten` keeps only events whose `league` is the harvested league — the first capture on the
   renamed API (38003010258) wrote 838 WNBA/CFB/UFC legs as the NBA board; that file was withdrawn (964ba5d, honest empty
   NBA board, never archived — `board_snapshots` has no betr rows since 10-01).
4. **Geo prompt can return on the root reload** (38006831834) → `clear_geo` runs again after it, in-page.
5. **Diagnostic trail** on every failure: `where()` (url / title / size / tells), request-side `graphql request <op>
   {league}` lines, each response op's schema on first sight, the wire tally, chips and visible text — a renamed op or a
   moved chip is read from the log, never guessed.
**A chip that does not route = Betr has not opened that league.** NBA (38006042574) and CBB (38007354366, the control:
out of season, off-screen, next to NBA in the strip) both: the press lands on the leaf, the route stays `/picks/home/lobby`,
the lobby lists no event of that league, the session is alive (authed API 200s). The run exits 3 with
`NO <LEAGUE> BOARD: the '<LEAGUE>' league chip does not route …`; exit 2 (`session may have expired`) is reserved for a
run whose traffic flowed but never authenticated. **Exit 4 = the proxy carried no Betr traffic** (run 38007254948: Chrome's
net-error page on the first load, zero 200s, the app fell back to `/auth` with a valid session) — every navigation now
reloads through net-error pages (`open_alive`), and the workflow retries exit 4 once on a new sticky proxy session
(`BETR_SESSION_ID=betr<run_id>a/b`). Known noise: ~10 `ERR_CONNECTION_CLOSED` XHRs per run through the DataImpulse
proxy (tracking / image fetches; the board still arrives) — watch, not blocking.

## NBA SWITCH (2026-10-20)
The workflow resolves the league itself (`WNBA` until 2026-10-19 UTC, then `NBA`; the `league` input overrides), and
**P3 dispatches the harvest at the window** (`nba-p3-afternoon-light.yml` step "Dispatch the Betr cloud harvest (window)",
`permissions: actions: write`) because GitHub dropped both crons on 10-09; the crons stay as a backup. The first real NBA
board is expected on 10-20 — until Betr opens the NBA board the NBA chip is inert (above) and the run is red by design,
leaving `boards/betr_nba_current.json` (the honest empty board) untouched.

## MAINTENANCE
- **Session: self-renewing (2026-10-09; owner: "one of the apps needs a key every ~30 days — make it auto").** The seeded
  session's `user-session-storage` carries three Keycloak JWTs (access, 30-day; OFFLINE refresh, never expires; id).
  `renew_session_state` refreshes with the session's own refresh token at `account.betr.app/realms/betr` (client `betr-rn`,
  probe 38000165529: headless refresh works, refresh token rotates) when the access token is within `BETR_RENEW_DAYS` (12) of
  expiry, swaps the three tokens inside the stored value and persists it to `nba_config.external_credentials`
  (`betr_session_state`, plus `betr_refresh_token`), which `load_session_state` reads FIRST; the GitHub secret
  `BETR_SESSION_STATE` is the seed / fallback only. The log prints only expiry dates and 6-char hashes. Current access token
  valid to 2026-10-28 → the first automatic renewal happens on the first run after 10-16. Manual re-seed
  (`nba/betr_export_session.py` → the secret) is needed only if the refresh grant itself is ever refused (log line
  `session: renewal failed …`).
- **alt/boosted MULTIPLIER** still reads 0 (nonRegularPercentage); the payout likely lives on
  allowedOptions[].marketOption — capture when the multiplier/slip work resumes. Lines + alt ladder are complete.

## FALLBACK: Path C (owner PC) — `nba/betr_harvest.py`
Same capture on the owner's machine (residential, no proxy/geo needed): UC Mode + persistent betr_profile
(log in once with BETR_LOGIN=1) + CDP intercept. Proven; use if the cloud proxy/session ever fails.

## FILES
- `nba/betr_harvest_cloud.py` — cloud harvester (this is the live one).
- `nba/betr_harvest.py` — Path C (owner PC) harvester.
- `nba/betr_export_session.py` — one-time session exporter (writes slim file for BETR_SESSION_STATE).
- `nba/betr_run_and_commit.py` — Path C commit wrapper (if running on the PC instead).
- `nba/probe_betr_cloud.py` — the diagnostic probe that proved the chain.
- `.github/workflows/betr-cloud-harvest.yml` — scheduled cloud job (LIVE).
- `.github/workflows/betr-cloud-test.yml` — the no-commit diagnostic workflow.
- `archive_live_boards.py::rows_betr` — parses the board file into board_snapshots.

────────────────────────────────────────────────────────────────────────────── (history below)


──────────────────────────────────────────────────────────────────────────────
## 1. WHAT BETR IS
- Betr Picks = real-money DFS pick'em (Betr Holdings; Miami; Joey Levy + Jake Paul). iPhone app + a web
  app at **picks.betr.app**. No public developer API (API Evangelist profile confirms: no OpenAPI/GraphQL
  SDL/MCP; anonymous requests to the backend return 403/500).
- One of five DFS apps we track. PrizePicks is the product target (fully covered); Sleeper is live with
  its ladder; Betr is the marginal fifth — useful as a price/line comparison source.

## 2. THE STACK (as reverse-engineered)
- **Auth:** Keycloak at `account.betr.app/realms/betr`, client `betr-rn`, standard OAuth2 + PKCE, with
  **MFA (SMS)**. Login yields an access token (RS256 JWT, aud "account", ~30-day exp) and an **OFFLINE
  refresh token** (`refresh_expires_in: 0` = never expires) that mints access tokens headless forever.
  Secrets already saved: `BETR_REFRESH_TOKEN`, `BETR_CLIENT_ID`. (These turned out NOT to be needed for
  the board — see §4 — but work and are harmless.)
- **Two API hosts:**
  - `api.betr.app` — the "events/slate" side. `GET /api/v3/events?league_ids=1` returns NBA games
    (league id "1"), teams, tip times, is_player_props_booked. **Works headless** with the Bearer.
  - `api.fantasy.betr.app/graphql` — the BOARD. Apollo GraphQL behind an **Envoy/Cloudflare edge**.
    Operation **`LeagueUpcomingEvents(league: NBA|WNBA)`** -> `getUpcomingEventsV2` -> events ->
    players -> **projections** (the props). Lobby also calls `GetLobbyContent`, `getAllLeaguesConfigs`,
    `GetEntryAndFeedConfigs`.
- **Realtime:** an Ably websocket (`ws-token-request` -> Ably token; channels market:* event:* fixture:*
  league:*). Carries live line-move DELTAS, not the initial board (idle channels push nothing; rewind
  empty). Not used by the harvester.

## 3. THE WALL, DIAGNOSED (17 raw-HTTP probes, all documented)
`api.fantasy.betr.app/graphql` returned **401 to every server-side request**, including the owner's own
live browser token. Ruled OUT with controlled tests, in order: token identity (captured browser token
401s from a server), token CLAIMS (captured vs refreshed are claim-for-claim identical, same sid), ACR/MFA
level, datacenter IP, **US residential proxy** (PROXY_URL verified Comcast/California/hosting:false — still
401), request headers (full sec-fetch-*/sec-ch-ua/channel/jurisdiction set), TLS/JA3 (10 curl_cffi
impersonations), HttpOnly/Set-Cookie session (none set anywhere), session rotation, and 8 guessed extra
headers. **Then the browser test revealed it:** loading picks.betr.app shows a **Cloudflare Turnstile
"Verify you are human" interactive checkbox.** Vanilla Playwright gets flagged and the checkbox loops.
Research (Zenrows/Scrapfly/ScrapingBee, 2026): Turnstile "requires JavaScript execution, browser
fingerprinting, and cryptographic proof-of-work" — **HTTP-only clients cannot pass, by design.** The
commercial Apify "Betr Picks Scraper" advertises exactly this: "public GraphQL, No login, **US residential
proxy**" — i.e. it runs a real stealth browser on a residential IP. That is the requirement.

## 4. THE SOLUTION THAT WORKS (Path C) — `nba/betr_harvest.py`
Runs on a **US-residential machine with a real display** (owner's Windows PC; the mini-PC later). Steps:
1. **SeleniumBase UC Mode** (`pip install seleniumbase`) launches undetected Chromium.
   `sb.uc_gui_click_captcha()` clears the Turnstile automatically.
2. **Persistent Chrome profile** (`./betr_profile`): the board requires being LOGGED IN (anonymous nav
   loops back to login). Log in BY HAND once (phone + password + SMS) with `BETR_LOGIN=1`; the session is
   saved and reused forever after — no re-login, no code.
3. **Passive CDP capture** (NOT an injected fetch — CSP blocks that, and the reloading lobby kills injected
   async scripts with a script-timeout). Enable the CDP `Network` domain, auto-click the league tab
   (`//*[normalize-space(text())="WNBA"]`), let the app fetch its OWN `getUpcomingEventsV2` (returns 200
   for the logged-in page), and pull the response body from the CDP performance log.
4. Parse projections -> `boards/betr_<league>_current.json` (+ `_meta`), and `betr_nba_current.json` for NBA.

Run:
    python -m pip install --upgrade seleniumbase
    $env:BETR_LEAGUE="WNBA"; $env:BETR_LOGIN="1"; python nba/betr_harvest.py   # FIRST run: log in by hand (3 min)
    $env:BETR_LEAGUE="WNBA"; python nba/betr_harvest.py                        # after: fully hands-off
    $env:BETR_LEAGUE="NBA";  python nba/betr_harvest.py                        # once NBA posts (2026-10-20)

## 5. VERIFIED DATA (WNBA, 2026-09-28, ~1,000 legs/run)
Correct field mapping, learned from the raw projection shape:
- **stat = projection `key`**: POINTS, REBOUNDS, ASSISTS, THREE_POINTERS_MADE, POINTS_REBOUNDS_ASSISTS,
  POINTS_REBOUNDS, POINTS_ASSISTS, ASSISTS_REBOUNDS, DOUBLE_DOUBLE, and period props **1ST_QUARTER_POINTS**
  (and by extension 1ST_HALF_*, etc.). (NOT `type` — that was the first-parse bug.)
- **`type` = payout TIER** (REGULAR / BOOSTED / SUPER_BOOSTED / MINI_BOOSTED / EDGE_1..4 / BOOSTED_4) —
  Betr's goblin/demon axis. Stored as leg['tier'].
- **sides = MORE / LESS** -> over/under flags (611/611 mains carry a side; 136 both-sided).
- **alt ladder = `nonRegularValue` when > 0** (0.0 = no alt). Example ladder: Jackie Young 3PT
  2.5 REGULAR -> 3.5 BOOSTED -> 4.5 SUPER_BOOSTED; assists 4.5 -> 5.5 -> 7.5 across EDGE/MINI tiers.
- 0 bad legs; 0 null lines.

## 6. PIPELINE WIRING (done)
`archive_live_boards.py::rows_betr` (committed): maps Betr `key` -> scorer market key, period prefixes
(1ST_QUARTER_/1ST_HALF_ -> _q1/_h1), files non-REGULAR tiers and alt rungs as `_alternate` (never overwrite
the main REGULAR line). Emits the 14-field tuple = board_snapshots columns. `betr` is already in
`ARCHIVE_APPS` and routed in main(). So the moment `boards/betr_nba_current.json` is committed, P3's
archiver ingests it exactly like the other apps.

## 7. SCHEDULING (built, not yet installed) — `nba/betr_run_and_commit.py`
Wrapper: runs the harvester, then commits the board file(s) to the repo via the GitHub API (so P3 ingests
them). For **Windows Task Scheduler** on the owner's PC / mini-PC. Needs a fine-grained GitHub token with
Contents:read/write, set once: `setx BETR_GH_TOKEN "<token>"`. Suggested schedule (Pacific): 10:45 and
13:15 to match P3's board windows:
    schtasks /create /tn "Betr AM" /tr "python <path>\betr_run_and_commit.py" /sc daily /st 10:45
    schtasks /create /tn "Betr PM" /tr "python <path>\betr_run_and_commit.py" /sc daily /st 13:15
NOTE: the wrapper assumes the repo layout (nba/ + boards/). Owner has been running loose files in C:\old;
if not cloning the repo, repackage the harvester + committer as two flat files. Decide clone-vs-flat before
installing.

## 8. STILL OPEN
- **alt/boosted MULTIPLIER**: `nonRegularPercentage` reads 0 in the capture; the payout multiplier likely
  lives on `allowedOptions[].marketOption` (marketOptionId present) or a sibling field. Lines are complete;
  capture the multiplier when the slip/multiplier work resumes.
- **Session longevity**: unknown how long the logged-in profile lasts before Betr forces re-auth. If a
  scheduled run finds itself logged out, it writes no board (harmless) until a BETR_LOGIN=1 run. Add a
  freshness check to the certifier's per-app board-liveness (already reads betr meta).
- **Whether our own infra can do this unattended** — see §9.

## 9. CAN OUR SYSTEM DO IT (GitHub Actions / Cloudflare Worker), UNATTENDED?

### ✅ TESTED ON THE RUNNER 2026-09-28 (this supersedes the analysis below)

**CLOUD BREAKTHROUGH — the GitHub runner now reaches Betr's board API (fantasy graphql 200).** Chain proven,
fully unattended on `ubuntu-latest`:
1. **Cloudflare Turnstile: CLEARED** by SeleniumBase UC Mode + Xvfb (SPA rendered 84k, no CF markers).
2. **Authenticated residential proxy: SOLVED** — UC Mode can't route an inline-auth proxy for sub-resources
   (SPA stuck at 39 bytes). FIX that WORKS: run a **local unauthenticated forward-proxy on the runner**
   (`python -m proxy --plugins proxy.plugin.ProxyPoolPlugin --proxy-pool <user>:<pass>@rp.scrapegw.com:6060`)
   and point Chromium at `127.0.0.1:8899`. With this, the SPA fully rendered THROUGH the residential proxy.
   (ProxyScrape sticky+US username `<user>-country-us-session-<id>-lifetime-<min>` is correct per their docs.)
3. **Geolocation gate (`/AllowLocation?...onSelectUsState=`): SOLVED in-page** — the rendered page has a state
   selector; clicking a state (e.g. California) clears it. After that: **`fantasy graphql status: 200`** from
   the runner — the exact call that 401'd 17 times over raw HTTP.

**LAST STEP (bounded):** after geo, the app routes to `/auth` — **the board requires a LOGGED-IN session**.
Confirmed 2026-09-28: every board URL (`/lobby/wnba`, `/wnba`, `/lineups/wnba`, `/`) redirects to `/auth`
with no session; there is NO guest path. A GitHub runner is ephemeral, so seed the session:
- **Built:** `nba/betr_export_session.py` — run once on the owner's PC (with the logged-in `betr_profile`);
  it dumps picks.betr.app cookies + localStorage to `betr_session_state.json`.
- **Built:** `nba/probe_betr_cloud.py` now loads `BETR_SESSION_STATE` (that JSON) — sets localStorage +
  cookies, reloads, and proceeds; the workflow passes the secret.
- **OWNER STEP (the only thing left):** on the PC, `python nba/betr_export_session.py`, copy
  betr_session_state.json contents into GH secret **BETR_SESSION_STATE**, then rerun betr-cloud-test (WNBA).
  Expected: past /auth -> getUpcomingEventsV2 200 + events>0 -> fully-cloud Betr. Re-export when the session
  expires (cadence TBD; the certifier's per-app betr freshness will flag it).
Once green, swap probe_betr_cloud's capture into a committing workflow (write boards/betr_nba_current.json +
commit) on a cron, and Betr runs entirely in GitHub with zero owner hardware.

### Earlier analysis (kept for context; the runner test above overturns the "cannot" verdict)

Built `nba/probe_betr_cloud.py` + `.github/workflows/betr-cloud-test.yml` (Chrome + fonts + Xvfb +
SeleniumBase UC) and RAN it on the GitHub runner:
- **UC Mode + Xvfb CLEARS Cloudflare on the runner.** Direct (no proxy) the SPA fully rendered
  (page_length 84,567, cloudflare markers NONE). The Turnstile wall is NOT the blocker for our infra.
- **Direct then hits a GEOLOCATION gate** (`/AllowLocation?...onSelectUsState=...`) — datacenter IP has no
  US state, so the board won't load. Not a bot wall.
- **Through PROXY_URL (rp.scrapegw.com, BOTH rotating AND sticky+country-us) the SPA never rendered**
  (stays at 39 bytes = the empty HTML shell, for 84s; direct renders 84k). Narrowed cause: **SeleniumBase
  UC Mode does not cleanly route an AUTHENTICATED proxy for sub-resources** — first navigation goes through,
  but the authenticated CONNECT for the many asset/sub-resource hosts fails, so the JS bundle never loads
  and the SPA can't boot. (Known UC-Mode limitation; not geo — never reached AllowLocation this run.)
So the remaining blockers are ORDINARY: a US-geolocated egress that actually loads the app. Paths, by effort:
  1. A **sticky/faster US residential proxy** (not per-request rotating) + longer bundle-load timeout ->
     UC+Xvfb on the runner should reach the board unattended.
  2. **Seed the US-state selection** into the runner profile to skip the geo gate (still needs US egress).
  3. **Mini-PC / owner PC (Path C)** — residential, no geo gate; most robust; already built.
⏳ NEXT CLOUD TEST: the fix for UC Mode + authenticated residential proxy is to remove inline auth from
  Chromium's view. Run a tiny LOCAL forward-proxy on the runner (e.g. `proxy.py` or `mitmdump --mode
  upstream:http://user:pass@rp.scrapegw.com:6060`) that injects the Proxy-Authorization, and point
  SeleniumBase at `127.0.0.1:<port>` (UNauthenticated). Then rerun betr-cloud-test; success = SPA renders
  (>5k, not AllowLocation) + a getUpcomingEventsV2 200. If it works, fully-cloud Betr is real -> wire
  betr_harvest's capture into the workflow. Alternatives if that still fails: an IP-allowlisted proxy
  endpoint (no user:pass), a creds-injecting Chrome extension, or a paid cloud-browser API. The Cloudflare
  **Worker** path stays dead (no real browser); the viable cloud path is the GitHub runner.

### Earlier analysis (kept for context; partly overturned by the runner test above)

- **GitHub Actions runner**: datacenter IP (Azure) — Turnstile scores it as a bot instantly. Even routing
  the browser through PROXY_URL (residential), the runner would need a full stealth browser (Camoufox /
  SeleniumBase UC) AND to solve the interactive Turnstile with NO human and NO display. Turnstile's
  interactive mode is specifically built to defeat this; success rates for headless solves are partial and
  decay with each Cloudflare update. Also the login is MFA-gated: the profile/session would have to be
  seeded once from a real login and shipped to the runner as a secret (a large, expiring cookie jar) —
  fragile, and it re-triggers Turnstile when the fingerprint/IP shifts between runs.
- **Cloudflare Worker**: cannot run a browser at all (no DOM/Chromium). Cloudflare Browser Rendering
  (Puppeteer on Workers) exists, but Betr's edge is ALSO Cloudflare — a CF-origin headless browser is
  trivially fingerprinted, and Browser Rendering is not built to solve third-party Turnstile. Dead end.
- **The honest options for "no owner machine":**
  1. **Pay a managed bypass** — the Apify Crawloop Betr actor, or a Cloudflare-bypass scraping API
     (ScrapingBee stealth_proxy, Zenrows, Scrapfly). They run stealth-browser fleets + residential proxies
     + (for interactive) captcha solvers. Cost, and dependence on a third party, but zero owner hardware.
     Endpoint (Apify): api.apify.com/v2/acts/crawloop~betr-picks-scraper/run-sync-get-dataset-items?token=…
  2. **A captcha-solver service (2Captcha/CapSolver) wired into a runner's stealth browser** — turns the
     interactive Turnstile into an API call (~$1-3 per 1000 solves). This is the only way a GitHub runner
     could plausibly do it unattended, and it's still brittle (proxy reputation + fingerprint must also
     pass). Meaningful engineering + a paid solver + a residential proxy, to automate the fifth app.
  3. **The mini-PC / home server** (already planned): residential IP by nature, always-on, real browser.
     This is Path C without the owner's desktop — the natural permanent home. **Recommended** when it's up:
     move betr_harvest.py + betr_run_and_commit.py there under Task Scheduler/cron, done.
- **Verdict:** the cheapest robust automation is the **mini-PC running Path C** (free, in-house, already
  built). Pure-cloud unattended (GitHub/CF) is possible only by paying a managed bypass or a captcha solver,
  and is not worth it for the marginal fifth app. Recommendation: run Path C on the owner's PC now if wanted,
  migrate to the mini-PC when it exists; revisit a paid API only if Betr becomes higher priority.
