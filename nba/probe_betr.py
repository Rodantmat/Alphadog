#!/usr/bin/env python3
"""
Betr probe v8 (2026-09-27): run the REAL board query. The lobby is GraphQL on api.fantasy.betr.app;
operation LeagueUpcomingEvents(league) returns events -> players -> projections (the props), where a
Projection carries value (line), currentValue, nonRegularValue (the ALTERNATE line) and allowedOptions
(over/under). This runs it for WNBA (NBA not posted yet; identical shape) and prints one player's
projections so we build the parser against real output.
Read-only. Secrets from env.
"""
import json
import os

from curl_cffi import requests

KC = "https://account.betr.app/realms/betr/protocol/openid-connect/token"
GQL = "https://api.fantasy.betr.app/graphql"
RT = os.environ.get("BETR_REFRESH_TOKEN", "")
CID = os.environ.get("BETR_CLIENT_ID", "betr-rn")

QUERY = (
    "query LeagueUpcomingEvents($league: League!) {\n"
    "  getUpcomingEventsV2(league: $league) {\n"
    "    ...EventInfoData\n"
    "    ... on TeamVersusEvent { teams { ...TeamInfoWithPlayers __typename } __typename }\n"
    "    ... on TeamTournamentEvent { teams { ...TeamInfoWithPlayers __typename } __typename }\n"
    "    ... on IndividualTournamentEvent { players { ...PlayerInfoWithProjections __typename } __typename }\n"
    "    ... on IndividualVersusEvent { players { ...PlayerInfoWithProjections __typename } __typename }\n"
    "    __typename\n  }\n}\n"
    "fragment EventInfoData on EventV2 { id date status sport league competitionType playerStructure name __typename }\n"
    "fragment TeamInfoWithPlayers on Team { ...TeamInfo players { ...PlayerInfoWithProjections __typename } __typename }\n"
    "fragment TeamInfo on Team { id name league sport fullName __typename }\n"
    "fragment PlayerInfoWithProjections on Player { ...PlayerInfo projections { ...PlayerProjection __typename } __typename }\n"
    "fragment PlayerInfo on Player { id firstName lastName position jerseyNumber record rank __typename }\n"
    "fragment PlayerProjection on Projection { marketId marketStatus isLive type label name key order value "
    "nonRegularPercentage nonRegularValue allowedOptions { marketOptionId outcome __typename } currentValue "
    "liveScoringDisabled __typename }\n"
)


def refresh():
    r = requests.post(KC, data={"grant_type": "refresh_token", "client_id": CID, "refresh_token": RT},
                      headers={"content-type": "application/x-www-form-urlencoded"}, timeout=30, impersonate="chrome124")
    return r.json()["access_token"] if r.status_code == 200 else None


def main():
    tok = refresh()
    if not tok:
        print("no token"); return
    H = {"authorization": "Bearer " + tok,
         "accept": "application/graphql-response+json, application/graphql+json, application/json",
         "content-type": "application/json", "channel": "MOBILE_WEB",
         "fantasy-api-version": "16.0", "fantasy-application-version": "3.42.9",
         "jurisdiction": "CA", "promotions-api-version": "6.0",
         "origin": "https://picks.betr.app", "referer": "https://picks.betr.app/",
         "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"}
    for league in ("WNBA", "NBA"):
        r = requests.post(GQL, headers=H, data=json.dumps({"operationName": "LeagueUpcomingEvents",
                          "query": QUERY, "variables": {"league": league}}), timeout=40, impersonate="chrome124")
        print(f"\n=== {league}: HTTP {r.status_code}, {len(r.text)}b")
        if r.status_code != 200:
            print(r.text[:300]); continue
        try:
            j = r.json()
        except Exception as e:
            print("json err", e, r.text[:200]); continue
        if j.get("errors"):
            print("GraphQL errors:", json.dumps(j["errors"])[:400])
        events = (j.get("data") or {}).get("getUpcomingEventsV2") or []
        print(f"events: {len(events)}")
        # find first player with projections
        def players_of(ev):
            ps = []
            for t in ev.get("teams", []) or []:
                ps += t.get("players", []) or []
            ps += ev.get("players", []) or []
            return ps
        shown = 0
        for ev in events:
            print(f"  event {ev.get('id')} {ev.get('name')} status={ev.get('status')} players={len(players_of(ev))}")
            for p in players_of(ev):
                projs = p.get("projections") or []
                if projs and shown < 2:
                    shown += 1
                    print(f"    PLAYER {p.get('firstName')} {p.get('lastName')} — {len(projs)} projections")
                    for pr in projs[:6]:
                        print(f"      {pr.get('type')!r} line={pr.get('value')} cur={pr.get('currentValue')} "
                              f"altVal={pr.get('nonRegularValue')} altPct={pr.get('nonRegularPercentage')} "
                              f"opts={[o.get('outcome') for o in pr.get('allowedOptions') or []]} status={pr.get('marketStatus')}")
            if shown >= 2:
                break


if __name__ == "__main__":
    main()
