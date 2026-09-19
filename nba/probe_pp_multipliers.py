#!/usr/bin/env python3
"""
PROBE — where does PrizePicks keep the GOBLIN / DEMON per-leg MULTIPLIER?

WHY. Everything we hold on PP multipliers is INFERRED: config board_payout_conversion_rules and
prizepicks_goblin_demon_tier_spec were derived from 19 placed slips, app screenshots and published
payout tables. The base Power Play table (2-pick 3x ... 6-pick 37.5x) is solid because it is fixed and
advertised. The GOBLIN/DEMON per-leg factors are NOT - they are ranges estimated backwards from
advertised all-demon payouts ("demon ~1.20-1.50x, goblin ~0.75-0.90x"). That is trial and error, not
ground truth.

The app SHOWS the combined multiplier the moment a second leg is added, so the per-leg factor exists in
the client. Either it is in a payload we have not parsed, or it comes from a table/endpoint we have not
found. This is the same hunt that solved the Underdog ladder (fact 49: alternate_projections) - find the
extra call.

NBA IS OUT OF SEASON until October, so probe MLB (league_id 2) and WNBA (league_id 3). WNBA is the
closest structural match to NBA; MLB is the deepest live board.

WHAT IT DOES - reports only, writes nothing:
  1. pulls /projections for each league and inventories EVERY key in data[].attributes and included[],
     so a field we never parsed cannot hide
  2. flags any key whose NAME or VALUE looks like a multiplier (payout, multiplier, factor, odds,
     boost, coeff) and any float in a plausible multiplier range on a non-standard odds_type
  3. compares attribute sets between standard / goblin / demon rows - if demons carry a field standard
     rows lack, that is the answer
  4. tries the sibling endpoints the web app is known to touch, to see if a payout table is served
     separately from the board
"""
import json
import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/139.0 Safari/537.36",
      "Accept": "application/json", "Origin": "https://app.prizepicks.com",
      "Referer": "https://app.prizepicks.com/"}
HINT = re.compile(r"payout|multip|factor|odds|boost|coeff|premium|discount|pick|combo|scal",
                  re.IGNORECASE)
LEAGUES = {"MLB": 2, "WNBA": 3}


def get(url, timeout=45):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)[:160]


def walk_keys(obj, prefix="", out=None, depth=0):
    """every key path in the structure, with a sample value"""
    if out is None:
        out = {}
    if depth > 6:
        return out
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{prefix}.{k}" if prefix else k
            if isinstance(v, (dict, list)):
                walk_keys(v, p, out, depth + 1)
            else:
                out.setdefault(p, v)
    elif isinstance(obj, list) and obj:
        walk_keys(obj[0], f"{prefix}[]", out, depth + 1)
    return out


def main():
    for name, lid in LEAGUES.items():
        print(f"\n{'='*78}\n{name} (league_id={lid})\n{'='*78}", flush=True)
        st, doc = get(f"https://api.prizepicks.com/projections?league_id={lid}&per_page=250&single_stat=true")
        if st != 200 or not isinstance(doc, dict):
            print(f"  projections failed: {st} {doc}", flush=True)
            continue
        data = doc.get("data") or []
        inc = doc.get("included") or []
        print(f"  {len(data)} projections, {len(inc)} included objects", flush=True)
        if not data:
            continue

        # 1) every attribute key we ever see on a projection
        allkeys = {}
        for row in data:
            walk_keys(row, "", allkeys)
        print(f"\n  -- PROJECTION KEYS ({len(allkeys)}) --", flush=True)
        for k in sorted(allkeys):
            flag = "  <== LOOKS RELEVANT" if HINT.search(k) else ""
            print(f"    {k:<52} e.g. {str(allkeys[k])[:30]}{flag}", flush=True)

        # 2) split by odds_type and diff the attribute sets
        by_type = {}
        for row in data:
            a = row.get("attributes") or {}
            by_type.setdefault(str(a.get("odds_type")), []).append(a)
        print(f"\n  -- ODDS TYPES: " + ", ".join(f"{k} x{len(v)}" for k, v in by_type.items()), flush=True)
        std_keys = set()
        for t, rows in by_type.items():
            if t in ("standard", "None"):
                for r in rows[:50]:
                    std_keys |= set(r.keys())
        for t, rows in by_type.items():
            if t in ("standard", "None"):
                continue
            tk = set()
            for r in rows[:50]:
                tk |= set(r.keys())
            extra = tk - std_keys
            print(f"    {t}: {len(rows)} rows, keys unique to this type: {sorted(extra) or 'NONE'}", flush=True)
            # any numeric in multiplier range that differs from standard?
            samp = rows[0]
            cand = {k: v for k, v in samp.items()
                    if isinstance(v, (int, float)) and 0.3 <= float(v) <= 3.0 and k != "line_score"}
            print(f"      numeric fields in 0.3-3.0 range: {cand}", flush=True)
            print(f"      sample: {json.dumps({k: samp.get(k) for k in list(samp)[:14]})[:300]}", flush=True)

        # 3) included object types and their keys
        types = {}
        for o in inc:
            types.setdefault(o.get("type"), []).append(o)
        print(f"\n  -- INCLUDED TYPES: " + ", ".join(f"{k} x{len(v)}" for k, v in types.items()), flush=True)
        for t, objs in types.items():
            ak = {}
            walk_keys(objs[0], "", ak)
            hits = [k for k in ak if HINT.search(k)]
            if hits:
                print(f"    {t}: RELEVANT KEYS {hits}", flush=True)
                print(f"      {json.dumps(objs[0])[:400]}", flush=True)

    # 4) sibling endpoints the web app is known to touch - is a payout table served separately?
    print(f"\n{'='*78}\nSIBLING ENDPOINTS\n{'='*78}", flush=True)
    for path in ("https://api.prizepicks.com/payout_multipliers",
                 "https://api.prizepicks.com/payouts",
                 "https://api.prizepicks.com/entry_types",
                 "https://api.prizepicks.com/leagues",
                 "https://api.prizepicks.com/projection_types",
                 "https://api.prizepicks.com/config",
                 "https://api.prizepicks.com/multipliers",
                 "https://api.prizepicks.com/board_settings"):
        st, doc = get(path, timeout=25)
        if st == 200:
            body = json.dumps(doc)[:600] if isinstance(doc, (dict, list)) else str(doc)[:300]
            print(f"  200  {path}\n       {body}", flush=True)
        else:
            print(f"  {st}  {path}  {str(doc)[:80]}", flush=True)


if __name__ == "__main__":
    main()
